export interface EmptyStateContent {
  heading: string;
  description: string;
}

export const GENERIC_EMPTY_STATE: EmptyStateContent = {
  heading: "Nothing here yet",
  description:
    "No tasks in this stage yet. They'll appear here as work progresses.",
};

export const emptyStateContent: Record<
  string,
  Record<string, EmptyStateContent>
> = {
  bug: {
    triage: {
      heading: "Awaiting triage",
      description: "New bug reports land here for initial assessment.",
    },
    investigate: {
      heading: "Nothing to investigate",
      description:
        "Bugs move here once triaged. Dig in to reproduce and find root causes.",
    },
    approve: {
      heading: "Nothing awaiting approval",
      description:
        "Investigated bugs wait here for a fix plan to be approved.",
    },
    resolve: {
      heading: "No active fixes",
      description: "Approved bugs are worked on here until a fix ships.",
    },
    validate: {
      heading: "Nothing to validate",
      description: "Resolved bugs wait here for verification before closing.",
    },
    closed: {
      heading: "No closed bugs",
      description: "Validated bugs end up here once fully resolved.",
    },
  },
  feature: {
    discuss: {
      heading: "No ideas yet",
      description:
        "Feature ideas start here. Create a task to kick off discussion.",
    },
    design: {
      heading: "Nothing in design",
      description:
        "Features move here once discussion has shaped the direction.",
    },
    prototype: {
      heading: "No prototypes",
      description: "Designed features are prototyped here to test the approach.",
    },
    implement: {
      heading: "Nothing being built",
      description: "Validated prototypes become real work in this stage.",
    },
    validate: {
      heading: "Nothing to validate",
      description: "Implemented features wait here for QA and acceptance.",
    },
    review: {
      heading: "Nothing in review",
      description: "Validated features await a final review before closing.",
    },
    closed: {
      heading: "No shipped features",
      description: "Reviewed features end up here once released.",
    },
  },
  improvement: {
    propose: {
      heading: "No proposals yet",
      description:
        "Propose an improvement — describe the problem and your suggested fix.",
    },
    approve: {
      heading: "Nothing awaiting approval",
      description: "Proposed improvements wait here for approval to proceed.",
    },
    implement: {
      heading: "Nothing being implemented",
      description: "Approved improvements move here while the work is in flight.",
    },
    validate: {
      heading: "Nothing to validate",
      description:
        "Implemented improvements wait here for verification before closing.",
    },
    closed: {
      heading: "No closed improvements",
      description: "Validated improvements end up here once complete.",
    },
  },
};

export function getEmptyStateContent(
  flowSlug: string,
  statusSlug: string,
): EmptyStateContent {
  return emptyStateContent[flowSlug]?.[statusSlug] ?? GENERIC_EMPTY_STATE;
}
