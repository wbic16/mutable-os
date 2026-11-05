# Mutable OS — Feature Brief: Universal Application Presentation Contract

**Status:** Proposed — commence after Textual visual refinement  
**Feature:** Application Workspace Views / Presentation Registration  
**Priority:** Architectural consolidation  
**Implementation philosophy:** Minimal abstraction, maximum reuse, no speculative framework development

## 1. Objective

Formalise the existing Mutable OS application architecture so that any application can register and expose alternative presentations appropriate to different workspace paradigms.

Flint already demonstrates this principle through its graphical Desktop and cell-based Textual presentations.

The objective is to make this capability **a standard feature of the Mutable OS application model**, rather than requiring bespoke integration for each application.

An application should be able to declare, conceptually:

> I am this application. These are my shared capabilities and services. These are the presentations I support. Here is how they are instantiated, activated, retained and disposed of.

The workspace should be responsible for discovering and hosting the appropriate presentation, without needing to understand the application's internal implementation.

**The goal is to make adding a new workspace-specific view to an existing application straightforward, predictable and minimally invasive.**

## 2. Architectural Principle

Separate three concerns:

1. **Application:** Shared functionality, business logic, state, services and persistent data.
2. **Presentation:** A workspace-specific interface through which users interact with the application.
3. **Workspace:** The environment that hosts, arranges, activates and manages presentations.

A presentation is not a separate application.

For example, Flint's Desktop and Textual interfaces should continue using the same underlying document services, editing operations, persistence mechanisms and application state.

However, they may use entirely different component hierarchies, rendering systems, layouts and interaction conventions.

### Important distinction: Skin versus presentation

Although this feature may be described informally as allowing applications to be "skinned" for different workspaces, the architectural model must support much more than cosmetic theming.

A Textual presentation may require an entirely different component tree from a Desktop presentation.

Likewise, Canvas and Spatial presentations may require fundamentally different interaction models.

**Do not attempt to create a universal UI renderer or force all presentations through one component hierarchy.**

The shared abstraction is the application contract, not the rendering technology.

## 3. Supported Workspace Paradigms

The architecture should recognise Mutable's existing workspace types:

- Desktop
- Textual
- Canvas
- Spatial

However, an application is not required to provide a presentation for every workspace.

The contract must support:

- Applications with only one presentation.
- Applications with presentations for several workspaces.
- Applications with multiple presentations for the same workspace.
- Applications that acquire additional presentations later.
- Applications with workspace-specific presentation capabilities or restrictions.

For example:

| Application | Desktop | Textual | Canvas | Spatial |
|---|---|---|---|---|
| Flint | Graphical editor | Cell-based editor | Future document surface | Future |
| Cardex | Graphical interface | Future TUI interface | Not specified | Not specified |
| Orb | Graph interface | Future textual graph explorer | Future | Future |
| Scry | Graphical interface | Textual interface | Not specified | Not specified |

These are illustrative possibilities, not implementation commitments.

**Do not implement speculative Canvas or Spatial presentations as part of this feature.**

## 4. Existing Architecture to Investigate

Before proposing changes, inspect the current implementation, especially:

- `src/feature-api/document-application.ts`
- `src/application/document-host-presentations.ts`
- `src/application/document-application-ports.ts`
- Flint's Desktop and Textual presentation integration.
- Existing application registration and instantiation mechanisms.
- Workspace composition and application switching.
- Scry and Gloss presenter factories.
- Cardex's retained-view adapter.
- Any existing application lifecycle and window-management contracts.

Determine which responsibilities are already adequately formalised.

**Prefer extending and consolidating existing interfaces over introducing parallel replacements.**

The existing Flint implementation should be treated as the primary reference implementation.

### Investigation questions

1. How are Mutable applications currently registered, instantiated and discovered?
2. How does a workspace select and host an application presentation?
3. Which parts of the existing architecture are reusable across applications?
4. Where does application-specific integration remain necessary?
5. Which interfaces currently mix application functionality with presentation components?
6. What assumptions exist about DOM retention, component ownership and lifecycle?
7. How are shared state, focus, selection and session ownership handled?
8. What is the smallest contract that would remove unnecessary bespoke integration?

Produce a concise architectural map showing the current structure and the proposed changes.

## 5. Proposed Contract Responsibilities

Investigate a modest set of contracts covering the following responsibilities.

The names and interfaces below are illustrative. Adapt them to the existing architecture rather than introducing them literally if equivalent abstractions already exist.

### 5.1 Application identity and instance

An application should expose its identity and a means of creating or retrieving its underlying instance.

Conceptually:

```ts
interface MutableApplication {
  id: string;
  name: string;

  createInstance(
    context: ApplicationContext
  ): ApplicationInstance;
}
```

An application instance owns or provides access to shared application capabilities and state.

It should not be intrinsically tied to a particular workspace.

### 5.2 Presentation registration

Applications should be able to register workspace-specific presentations.

Conceptually:

```ts
interface ApplicationPresentation {
  id: string;
  applicationId: string;

  workspace: WorkspaceKind;

  create(
    instance: ApplicationInstance,
    context: PresentationContext
  ): PresentationHandle;
}
```

The registry should support multiple presentation identifiers per application and workspace.

This enables, for example, a full editor and a compact document reader to coexist as alternative Flint presentations.

Do not assume that a workspace identifier uniquely identifies a presentation.

### 5.3 Presentation lifecycle

Establish consistent lifecycle semantics for:

- Creation and mounting.
- Activation and deactivation.
- Workspace switching.
- Resizing and viewport changes.
- Suspension and resumption, where applicable.
- Disposal and cleanup.

Illustrative interface:

```ts
interface PresentationHandle {
  mount(): void;
  activate?(): void;
  deactivate?(): void;
  resize?(): void;
  dispose(): void;
}
```

Do not impose lifecycle methods that duplicate existing framework behaviour without a demonstrable need.

The contract should support both retained presentations and presentations that can be reconstructed.

### 5.4 State ownership

Define clear ownership boundaries.

**Application/session state:**
- Open documents and application data.
- Unsaved changes.
- Undo/redo history.
- Shared editing and knowledge services.
- Durable selection or navigation state, where appropriate.

**Presentation state:**
- Open menus.
- Presentation-specific panels.
- Local layout and chrome.
- Textual zoom and cell-grid settings.
- Workspace-specific visual preferences.

**Workspace state:**
- Window placement and dimensions.
- Presentation activation.
- Workspace navigation and arrangement.
- Application hosting.

Some state, such as scroll position, focus and caret placement, may require explicit handoff between presentations.

Investigate the existing Flint behaviour before formalising these boundaries.

**Do not introduce heavyweight state snapshots, duplicate document models or unnecessary serialisation.**

### 5.5 Capabilities and fallback

An application should be able to declare which presentations are available for a given workspace.

When a requested presentation is unavailable, the host should follow a predictable policy.

Investigate appropriate behaviour, potentially including:

- Selecting a registered default presentation.
- Offering an explicit compatible presentation.
- Displaying an informative unsupported-presentation state.
- Opening the application in a supported workspace when explicitly requested.

Do not silently mount an incompatible graphical view inside Textual or another workspace.

Keep fallback policy simple and consistent.

## 6. Multiple Simultaneous Presentations

The architecture should not assume that an application instance can have only one presentation.

For example, a future user might wish to view the same Flint document in Desktop and Canvas simultaneously.

This suggests a relationship of:

```text
Application Definition
    |
    +-- Application Instance
            |
            +-- Desktop Presentation
            |
            +-- Textual Presentation
            |
            +-- Canvas Presentation
```

However, simultaneous editable presentations introduce additional questions concerning focus, selection, editing transactions and concurrency.

**Do not solve simultaneous editing as part of this feature.**

Instead, investigate a minimal mechanism for declaring presentation activation or coexistence constraints.

For example, an application may initially permit only one interactive presentation of a given session at a time.

The architecture should accommodate future simultaneous presentations without requiring their implementation now.

## 7. Workspace Independence

Workspace implementations should not need application-specific knowledge to instantiate supported views.

The desired interaction is conceptually:

```ts
const presentation = registry.resolve({
  applicationId,
  workspaceKind,
  presentationId
});

host.mount(presentation);
```

This is illustrative, not prescribed API syntax.

The workspace should not require special-case logic such as:

```ts
if (applicationId === "flint") {
  // Special Flint Textual integration
}
```

Investigate whether existing special cases can be removed safely through a small registration mechanism.

Do not introduce a generic service container, dependency injection framework or plugin runtime unless the existing architecture demonstrably requires it.

## 8. Relationship to the Textual Workspace

Textual should become an ordinary consumer of the standard application presentation contract.

The new contract must preserve:

- The existing cell-based rendering architecture.
- Monospaced, deterministic grid layout.
- Responsive cell-grid recalculation.
- Textual zoom behaviour.
- Half-size marginalia subgrids.
- Native rich-content islands.
- Keyboard navigation and application switching.
- Existing Flint editing and session behaviour.

Textual-specific rendering responsibilities must remain within the Textual presentation infrastructure.

The universal contract must not contain assumptions about cell geometry or textual layout.

Likewise, Desktop presentation infrastructure must remain independent of Textual rendering concerns.

**Do not retrofit graphical views to accommodate Textual-specific requirements.**

## 9. Implementation Scope and Constraints

This is an architectural consolidation, not a platform rewrite.

The implementation should be deliberately bounded.

### Required

- Identify and document the existing common presentation architecture.
- Formalise the minimum useful application/presentation registration contract.
- Establish consistent lifecycle and state-ownership semantics.
- Support discovery of registered presentations by workspace.
- Provide predictable unsupported-presentation behaviour.
- Integrate at least one existing application as a reference implementation.
- Demonstrate that application-specific workspace switching logic can be reduced or eliminated.
- Preserve existing application functionality.

### Not required

- Rewriting all Mutable applications.
- Implementing additional Textual application views.
- Creating Canvas or Spatial presentations.
- Building a universal renderer.
- Introducing a new application state-management framework.
- Implementing simultaneous editable views.
- Reworking the window manager.
- Redesigning the application launcher.
- Creating a complex plugin or extension ecosystem.
- Developing a comprehensive new testing framework.

## 10. Suggested Implementation Strategy

I recommend no more than two principal stages.

### Stage A — Investigation and contract design

Inspect the existing architecture and produce a concise report containing:

1. Current application and presentation architecture.
2. Existing reusable interfaces and lifecycle mechanisms.
3. Specific integration gaps.
4. Proposed minimal contract.
5. Files and modules requiring modification.
6. Compatibility and regression risks.
7. A bounded implementation plan.

Prefer a short report with concrete code references over an extensive speculative design document.

Do not begin major implementation before resolving any genuinely consequential architectural uncertainty.

### Stage B — Implementation and qualification

Implement the approved contract.

Use Flint as the primary reference application, reusing its existing Desktop and Textual presentations.

Where practical, demonstrate the contract's generality using one additional existing presentation integration, such as Scry or Cardex, without rewriting its UI.

Qualification should demonstrate:

- Presentation registration and discovery.
- Correct workspace selection.
- Preservation of shared application state.
- Correct lifecycle behaviour.
- Graceful handling of unsupported presentations.
- No regression in Desktop or Textual Flint.
- No unnecessary application-specific workspace branching.

Use focused tests and existing test infrastructure.

Avoid extensive synthetic test matrices or exhaustive cross-workspace combinations.

## 11. Performance and Complexity

The contract should impose negligible runtime overhead.

Presentation lookup should be straightforward, ideally a direct registry lookup.

Workspace switching must not require:

- Reconstructing the underlying application instance unnecessarily.
- Reinitialising document services.
- Reloading persistent application state.
- Taking heavyweight snapshots.
- Duplicating editing sessions.
- Recreating retained editors without need.

Preserve existing fast paths.

Do not sacrifice runtime simplicity in pursuit of theoretical extensibility.

## 12. Acceptance Criteria

The feature can be considered complete when:

1. A Mutable application can declare and register its supported workspace presentations through a consistent mechanism.
2. Workspace hosts can resolve and instantiate those presentations without application-specific branching for the supported reference integrations.
3. Multiple presentations can share an underlying application instance and services.
4. Presentation lifecycle and state ownership are documented and consistently implemented.
5. Unsupported presentation requests are handled predictably.
6. Existing Flint Desktop and Textual behaviour remains unchanged.
7. A developer can add a new workspace-specific presentation to an existing application without modifying its core business logic, provided the required application capabilities are already exposed.
8. The implementation remains small, comprehensible and compatible with the existing architecture.

## 13. Longer-Term Architectural Direction

Mutable OS should ultimately support the idea that an application is not synonymous with a particular graphical interface.

Applications provide capabilities, state and behaviour.

Presentations expose those capabilities through workspace-appropriate interfaces.

This may eventually enable the same application to appear as:

- A conventional graphical application.
- A compact textual interface.
- A spatial document surface.
- An interactive knowledge visualisation.
- A specialised read-only or task-oriented instrument.

The presentation contract should make these possibilities feasible without attempting to implement them prematurely.

This is consistent with Mutable OS's broader philosophy:

**Same Thing. Many Forms.**

---

## 14. Immediate Instruction

Complete the current Textual visual refinement work before commencing this feature.

Then begin **Stage A: Investigation and Contract Design**.

Inspect the actual repository and report what already exists before proposing new abstractions.

Pay particular attention to preserving the successful Flint Desktop/Textual architecture and avoiding parallel or redundant application frameworks.

**Do not begin Stage B implementation until the Stage A findings have been reviewed.**

The intended outcome is a modest, reusable architectural contract that makes the next workspace-specific application presentation significantly easier to implement.