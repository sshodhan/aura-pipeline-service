"""XGBoost-based quality scoring model.

Replaces the rule-based Stage 5 quality scoring with a trained ML model.
Uses 56 engineered features from outfit bundles.

Cold start strategy: bootstrap from rule-based scores as synthetic labels.
Production: retrain weekly with user feedback data.
"""

import os
import json
import pickle
from typing import Optional
from datetime import datetime

import numpy as np
import xgboost as xgb
from sklearn.model_selection import train_test_split
from sklearn.metrics import (
    accuracy_score, roc_auc_score, f1_score, classification_report,
)

from src.config import settings
from src.services.feature_extraction import (
    extract_features,
    extract_features_batch,
    get_feature_names,
)
from src.utils.logger import get_logger

logger = get_logger("quality_scorer")


class QualityScorer:
    """ML-based outfit quality scoring using XGBoost."""

    def __init__(self):
        self.model: Optional[xgb.XGBClassifier] = None
        self.version: Optional[str] = None
        self.feature_names: list[str] = get_feature_names()
        self.train_metrics: Optional[dict] = None

    def load_model(self, model_dir: Optional[str] = None) -> bool:
        """Load a trained model from disk.

        Returns True if model was loaded, False if not found.
        """
        if model_dir is None:
            model_dir = os.path.join(settings.model_dir, "quality", "v1")

        model_path = os.path.join(model_dir, "model.pkl")
        config_path = os.path.join(model_dir, "config.json")

        if not os.path.exists(model_path):
            logger.warning("no_quality_model_found", path=model_path)
            return False

        with open(model_path, "rb") as f:
            self.model = pickle.load(f)

        if os.path.exists(config_path):
            with open(config_path, "r") as f:
                config = json.load(f)
                self.version = config.get("version", "unknown")
                self.train_metrics = config.get("train_metrics")

        logger.info(
            "loaded_quality_model",
            version=self.version,
            path=model_path,
        )
        return True

    def save_model(self, model_dir: Optional[str] = None, version: str = "v1") -> str:
        """Save the model and metadata to disk."""
        if self.model is None:
            raise ValueError("No model to save")

        if model_dir is None:
            model_dir = os.path.join(settings.model_dir, "quality", version)

        os.makedirs(model_dir, exist_ok=True)
        model_path = os.path.join(model_dir, "model.pkl")
        config_path = os.path.join(model_dir, "config.json")
        features_path = os.path.join(model_dir, "feature_names.json")

        with open(model_path, "wb") as f:
            pickle.dump(self.model, f)

        config = {
            "version": version,
            "trained_at": datetime.utcnow().isoformat(),
            "feature_count": len(self.feature_names),
            "train_metrics": self.train_metrics,
            "model_type": "xgboost",
            "xgb_params": self.model.get_params(),
        }
        with open(config_path, "w") as f:
            json.dump(config, f, indent=2, default=str)

        with open(features_path, "w") as f:
            json.dump(self.feature_names, f, indent=2)

        self.version = version
        logger.info("saved_quality_model", version=version, path=model_dir)
        return model_dir

    def train(
        self,
        bundles: list[dict],
        labels: list[int],
        test_size: float = 0.2,
    ) -> dict:
        """Train the quality model on labeled data.

        Args:
            bundles: list of outfit bundle dicts
            labels: list of binary labels (1 = good, 0 = bad)
            test_size: fraction of data for validation

        Returns:
            dict with training metrics
        """
        logger.info("training_quality_model", n_samples=len(bundles))

        # Extract features
        X = extract_features_batch(bundles)
        y = np.array(labels, dtype=np.int32)

        # Train/test split
        X_train, X_test, y_train, y_test = train_test_split(
            X, y, test_size=test_size, random_state=42, stratify=y
        )

        # Initialize model
        self.model = xgb.XGBClassifier(
            n_estimators=100,
            max_depth=6,
            learning_rate=0.1,
            subsample=0.8,
            colsample_bytree=0.8,
            objective="binary:logistic",
            eval_metric="logloss",
            random_state=42,
            n_jobs=-1,
            tree_method="hist",
            device="cpu",
        )

        # Train with early stopping
        self.model.fit(
            X_train, y_train,
            eval_set=[(X_test, y_test)],
            verbose=False,
        )

        # Evaluate
        y_pred = self.model.predict(X_test)
        y_prob = self.model.predict_proba(X_test)[:, 1]

        metrics = {
            "accuracy": float(accuracy_score(y_test, y_pred)),
            "auc_roc": float(roc_auc_score(y_test, y_prob)),
            "f1_score": float(f1_score(y_test, y_pred)),
            "n_train": int(len(X_train)),
            "n_test": int(len(X_test)),
            "positive_rate_train": float(y_train.mean()),
            "positive_rate_test": float(y_test.mean()),
        }
        self.train_metrics = metrics

        # Feature importance
        importance = self.model.feature_importances_
        top_features = sorted(
            zip(self.feature_names, importance),
            key=lambda x: x[1],
            reverse=True,
        )[:10]
        metrics["top_features"] = [
            {"name": name, "importance": float(imp)} for name, imp in top_features
        ]

        logger.info(
            "training_complete",
            accuracy=metrics["accuracy"],
            auc_roc=metrics["auc_roc"],
            f1=metrics["f1_score"],
        )
        return metrics

    def train_from_bootstrap(self, bundles: list[dict]) -> dict:
        """Bootstrap training using rule-based scores as labels.

        Outfits with rule-based confidence > 65 are labeled positive (1).
        Outfits with confidence < 45 are labeled negative (0).
        Outfits in between are excluded (ambiguous).
        """
        labels = []
        filtered_bundles = []

        for bundle in bundles:
            quality = bundle.get("qualityMetrics", {})
            confidence = quality.get("confidenceScore", 50)

            if confidence > 65:
                labels.append(1)
                filtered_bundles.append(bundle)
            elif confidence < 45:
                labels.append(0)
                filtered_bundles.append(bundle)
            # Skip ambiguous cases

        if len(filtered_bundles) < 100:
            logger.warning(
                "insufficient_bootstrap_data",
                n_samples=len(filtered_bundles),
                min_required=100,
            )
            return {"error": "Insufficient data for training", "n_samples": len(filtered_bundles)}

        logger.info(
            "bootstrap_data_prepared",
            n_positive=sum(labels),
            n_negative=len(labels) - sum(labels),
            n_excluded=len(bundles) - len(filtered_bundles),
        )
        return self.train(filtered_bundles, labels)

    def predict_score(self, bundle: dict) -> float:
        """Predict quality score (0-100) for a single outfit bundle."""
        if self.model is None:
            raise RuntimeError("Model not loaded. Call load_model() or train() first.")

        features = extract_features(bundle).reshape(1, -1)
        probability = self.model.predict_proba(features)[0, 1]
        return float(probability * 100)

    def predict_scores_batch(self, bundles: list[dict]) -> list[float]:
        """Predict quality scores for a batch of bundles."""
        if self.model is None:
            raise RuntimeError("Model not loaded. Call load_model() or train() first.")

        if not bundles:
            return []

        features = extract_features_batch(bundles)
        probabilities = self.model.predict_proba(features)[:, 1]
        return [float(p * 100) for p in probabilities]

    def blend_scores(
        self,
        ml_score: float,
        rule_score: float,
    ) -> float:
        """Blend ML score with rule-based score using configured weights.

        Returns blended score (0-100).
        """
        ml_weight = settings.quality_blend_ml_weight
        rule_weight = settings.quality_blend_rule_weight
        return ml_weight * ml_score + rule_weight * rule_score

    def get_feature_importance(self) -> list[dict]:
        """Get feature importance from the trained model."""
        if self.model is None:
            return []

        importance = self.model.feature_importances_
        return sorted(
            [
                {"name": name, "importance": float(imp)}
                for name, imp in zip(self.feature_names, importance)
            ],
            key=lambda x: x["importance"],
            reverse=True,
        )

    def get_model_info(self) -> dict:
        """Get model metadata."""
        return {
            "loaded": self.model is not None,
            "version": self.version,
            "feature_count": len(self.feature_names),
            "train_metrics": self.train_metrics,
        }
