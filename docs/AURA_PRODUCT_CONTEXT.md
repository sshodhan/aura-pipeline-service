# Aura: Product Context for the Fashion Intelligence Service

**Audience:** Engineers and coding agents working on `aura-pipeline-service`
**Consumer application:** [`sshodhan/v0-aura-stylist-agent`](https://github.com/sshodhan/v0-aura-stylist-agent)
**Purpose:** Explain the consumer product, the recommendation experience, and
what the independent fashion intelligence service is responsible for.

**Companion documents:**

- [`CONSUMER_INTEGRATION_CONTRACT.md`](./CONSUMER_INTEGRATION_CONTRACT.md): what the consumer
  app collects and renders today, and what a future service response must contain.
- [`RECOMMENDATION_OWNERSHIP.md`](./RECOMMENDATION_OWNERSHIP.md): which system owns
  each capability.
- [`FASHION_INTELLIGENCE_PLAN.md`](./FASHION_INTELLIGENCE_PLAN.md): proposed phased plan.

> **How to read this document.** Sections 1–10 state product intent. They describe
> what the service *should* do, not what it does today. Section 11 describes the
> consumer experience as it exists in code, and every claim there is labeled.
> Labels used throughout `docs/`:
>
> - **Verified:** confirmed by reading code at the commit cited.
> - **Planned:** an intended capability that is not implemented.
> - **Assumption:** a working belief that has not been confirmed. Check it before
>   relying on it.

---

## 1. What Aura is building

Aura is an AI personal styling experience that helps people explore styles that
work for them.

The product should inspire fashion discovery. Weather-appropriate clothing
suggestions alone are not the goal.

Picture walking through New York or Paris past many boutiques. One storefront
catches your eye because it presents a distinctive, coherent aesthetic that
feels desirable. Aura aims to recreate that experience with AI-generated styling
recommendations.

The product should show taste and fashion expertise **before** it has collected
any personal preference data.

## 2. The core product challenge

A new user might provide only:

| Input | Example |
|---|---|
| Gender | Female |
| Age range | 36–45 |
| Location | New York City |
| Lifestyle | Casual |
| Occasion | Hanging out |
| Weather | Cool autumn afternoon |

This establishes context, but not individual taste. The service must use its
fashion expertise to recommend compelling interpretations of that context. For
example:

- **Modern City Casual:** relaxed metropolitan tailoring with thoughtful
  proportions and understated accents.
- **Rugged Urban:** utility-inspired layers, textured materials and grounded
  footwear.
- **Artistic Minimal:** architectural silhouettes, restrained colors and more
  experimental proportions.

These are illustrative aesthetic concepts. They are **not** fixed outputs or
mandatory archetypes.

Each direction should be desirable, practical and coherent on its own. The first
recommendations should be good enough that the user wants to explore more.

## 3. How Aura works (product view)

The consumer app provides these experiences. Section 11 covers how each one
works in code today.

| Experience | What the user does |
|---|---|
| **Context selection** | Chooses location, lifestyle and occasion. Weather is added automatically. Optional profile information includes demographics and styling preferences. |
| **Initial recommendation** | Receives outfit advice and an image of the recommended look. |
| **The Aisle** | Browses up to three looks in different styling directions. The app prepares the additional looks in the background and keeps their images and outfit details. |
| **Refine** | Adjusts a recommendation (more casual, dressier) or picks an aesthetic mood. |
| **Visualize** | Generates more images of the look, including personalized ones where supported. |
| **Save and Share** | Saves and shares styling recommendations. |

These are consumer-facing experiences. The fashion intelligence service does not
implement them, but it must understand what they need.

## 4. What makes a recommendation compelling

| Quality | Meaning |
|---|---|
| **Styling expertise** | Garments work together through deliberate silhouette, proportion, texture, layering and color decisions. |
| **Fashion grounding** | Recommendations draw on contemporary fashion evidence and timeless styling principles. |
| **Contextual relevance** | Looks respect occasion, weather, lifestyle and stated preferences. |
| **Aesthetic range** | The service explores genuinely different fashion directions, not superficial variations of one outfit. |
| **Visual specificity** | Each recommendation has enough garment-level detail for a downstream image model to depict it accurately. |
| **Discoverability** | A collection invites exploration. Each recommendation has a recognizable aesthetic identity and a short rationale. |

## 5. Recommendation responsibilities

The fashion intelligence service owns:

- Fashion evidence and provenance
- Aesthetic vocabulary and style concepts
- Context interpretation
- Style-direction generation
- Outfit composition
- Fashion-quality evaluation
- Collection-level curation
- Recommendation versioning
- Structured recommendation APIs
- Optional caching and batch generation
- Offline recommendation-quality experiments

The consumer application owns:

- User interface and interactions
- Profile collection and sign-in
- Current-look and Aisle selection state
- Image generation and presentation
- The Refine interaction
- Visualize, Save and Share
- Navigation and client-side asset lifecycle

This is an **architectural** separation, not just a division of knowledge. The
service should understand the consumer experience and still run without the
consumer application. See [`RECOMMENDATION_OWNERSHIP.md`](./RECOMMENDATION_OWNERSHIP.md).

## 6. Required recommendation semantics (Planned)

The service should return a **collection** with three roles:

| Role | Meaning |
|---|---|
| **Best Bet** | The strongest overall recommendation for the context. |
| **Adjacent Alternative** | A meaningfully different but approachable interpretation. |
| **Exploration** | A direction that broadens the user's style range without breaking context or constraints. |

Each recommendation should contain:

- Stable recommendation identifier
- Aesthetic identity and title
- Complete garment specifications
- Silhouette and proportion strategy
- Color and material strategy
- Styling rationale
- Identifiers of the fashion evidence it relies on
- Evaluation metadata
- Recommendation engine version

The three recommendations must be distinguishable from each other without any
historical preference data.

## 7. First-session quality comes before personalization

Personalization matters, but it comes second.

Do not assume that saving, sharing, swiping, ratings or interaction history are
needed for excellent recommendations. The service must perform well for a
completely new user.

Preference learning may later influence which style directions are chosen. It
should not replace the fashion expertise underneath.

## 8. Performance considerations

- The consumer experience depends on getting useful recommendations quickly.
- Support progressive retrieval or independent delivery of each candidate where
  it helps.
- Do not require expensive batch recomputation for each user request.
- Measure model calls, latency, retries and cost.
- Use precomputation and caching to improve efficiency, but never at the cost
  of contextual correctness or aesthetic quality.

## 9. Compatibility and independence

The service must not import:

- React components
- Consumer UI state
- Browser local storage
- Client authentication implementations
- Image-generation lifecycle code
- Aisle carousel components

Instead, it keeps versioned API contracts and contract tests. It has its own
local execution path, mock fixtures, test harness and deployment lifecycle.
Consumer-specific behavior stays outside the recommendation engine.

## 10. Product success criterion

A first-time user should receive recommendations that are visually promising,
thoughtfully composed, contextually relevant and different enough from each
other to make exploring further worthwhile.

The goal is **not** maximum outfit volume or cache-hit rate. The goal is
consistently excellent fashion recommendations.

> **Core principle:** Aura should be a compelling stylist before it becomes a
> personalized stylist.

---

## 11. The consumer experience today

<!-- CONSUMER_EXPERIENCE_TODAY -->
