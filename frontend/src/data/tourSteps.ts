import type { TourStep } from "@/composables/useOnboardingTour";

export const defaultTourSteps: TourStep[] = [
  {
    id: "nav-tabs",
    targetSelector: ".navbar__tabs",
    title: "Navigate TaskFlow",
    body: "Use these tabs to switch between Flows, Projects, and Settings.",
    placement: "bottom",
  },
  {
    id: "team-switcher",
    targetSelector: '[data-testid="navbar-team-button"]',
    title: "Your teams",
    body: "Switch teams or manage memberships from here.",
    placement: "bottom",
  },
  {
    id: "board-columns",
    targetSelector: ".board__columns",
    title: "Workflow stages",
    body: "Each column is a workflow stage. Tasks move left to right as they progress.",
    placement: "top",
  },
  {
    id: "create-task",
    targetSelector: ".board__create-btn",
    title: "Create a task",
    body: "Click here to create a new task in this flow.",
    placement: "left",
  },
  {
    id: "filters",
    targetSelector: ".filter-bar",
    title: "Narrow the view",
    body: "Filter tasks by project, priority, assignee, or due date.",
    placement: "bottom",
  },
];
