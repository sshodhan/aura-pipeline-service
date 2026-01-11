import * as pulumi from "@pulumi/pulumi";
import * as gcp from "@pulumi/gcp";
import * as random from "@pulumi/random";

interface SecretsArgs {
  name: string;
  dependsOn?: pulumi.Resource[];
}

export interface SecretsOutput {
  geminiApiKey: gcp.secretmanager.Secret;
  weatherApiKey: gcp.secretmanager.Secret;
  redisPassword: gcp.secretmanager.Secret;
  geminiApiKeyVersion: gcp.secretmanager.SecretVersion;
  weatherApiKeyVersion: gcp.secretmanager.SecretVersion;
  redisPasswordVersion: gcp.secretmanager.SecretVersion;
}

export function createSecrets(args: SecretsArgs): SecretsOutput {
  // -----------------------------------------------------------------------------
  // Gemini API Key
  // -----------------------------------------------------------------------------
  const geminiApiKey = new gcp.secretmanager.Secret(
    `${args.name}-gemini-key`,
    {
      secretId: `${args.name}-gemini-api-key`,
      replication: {
        auto: {},
      },
      labels: {
        app: args.name,
        type: "api-key",
      },
    },
    { dependsOn: args.dependsOn }
  );

  // Placeholder version - replace with actual key via CLI or console
  const geminiApiKeyVersion = new gcp.secretmanager.SecretVersion(
    `${args.name}-gemini-key-version`,
    {
      secret: geminiApiKey.id,
      secretData: pulumi.secret("REPLACE_WITH_ACTUAL_GEMINI_API_KEY"),
    }
  );

  // -----------------------------------------------------------------------------
  // Weather API Key (OpenWeatherMap or similar)
  // -----------------------------------------------------------------------------
  const weatherApiKey = new gcp.secretmanager.Secret(
    `${args.name}-weather-key`,
    {
      secretId: `${args.name}-weather-api-key`,
      replication: {
        auto: {},
      },
      labels: {
        app: args.name,
        type: "api-key",
      },
    },
    { dependsOn: args.dependsOn }
  );

  const weatherApiKeyVersion = new gcp.secretmanager.SecretVersion(
    `${args.name}-weather-key-version`,
    {
      secret: weatherApiKey.id,
      secretData: pulumi.secret("REPLACE_WITH_ACTUAL_WEATHER_API_KEY"),
    }
  );

  // -----------------------------------------------------------------------------
  // Redis Password (auto-generated)
  // -----------------------------------------------------------------------------
  const redisPasswordValue = new random.RandomPassword(`${args.name}-redis-pwd`, {
    length: 32,
    special: false, // Memorystore doesn't support all special chars
  });

  const redisPassword = new gcp.secretmanager.Secret(
    `${args.name}-redis-password`,
    {
      secretId: `${args.name}-redis-password`,
      replication: {
        auto: {},
      },
      labels: {
        app: args.name,
        type: "database",
      },
    },
    { dependsOn: args.dependsOn }
  );

  const redisPasswordVersion = new gcp.secretmanager.SecretVersion(
    `${args.name}-redis-password-version`,
    {
      secret: redisPassword.id,
      secretData: redisPasswordValue.result,
    }
  );

  // -----------------------------------------------------------------------------
  // IAM: Allow Cloud Run to access secrets
  // -----------------------------------------------------------------------------

  // Get the default compute service account
  const project = gcp.organizations.getProjectOutput({});
  const computeServiceAccount = pulumi.interpolate`${project.number}-compute@developer.gserviceaccount.com`;

  // Grant access to each secret
  const secrets = [geminiApiKey, weatherApiKey, redisPassword];
  secrets.forEach((secret, index) => {
    new gcp.secretmanager.SecretIamMember(
      `${args.name}-secret-access-${index}`,
      {
        secretId: secret.id,
        role: "roles/secretmanager.secretAccessor",
        member: pulumi.interpolate`serviceAccount:${computeServiceAccount}`,
      }
    );
  });

  return {
    geminiApiKey,
    weatherApiKey,
    redisPassword,
    geminiApiKeyVersion,
    weatherApiKeyVersion,
    redisPasswordVersion,
  };
}

/**
 * Helper to create secret reference for Cloud Run
 */
export function secretRef(
  secret: gcp.secretmanager.Secret,
  version: string = "latest"
): pulumi.Output<string> {
  return pulumi.interpolate`${secret.id}/versions/${version}`;
}
