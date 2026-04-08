export const RESOLUTIONS: Record<string, string[]> = {
  bug: ["fixed", "invalid", "duplicate", "wont_fix", "cannot_reproduce"],
  feature: ["completed", "rejected", "duplicate", "deferred"],
  improvement: ["completed", "wont_fix", "deferred"],
};

interface TransitionDef {
  fromStatusId: string;
  toStatusId: string;
}

interface ValidationResult {
  valid: boolean;
  error?: string;
  message?: string;
  allowedTargets?: string[];
  allowedResolutions?: string[];
}

export function validateTransition(
  fromStatusId: string,
  toStatusId: string,
  allowedTransitions: TransitionDef[]
): ValidationResult {
  const isAllowed = allowedTransitions.some(
    (t) => t.fromStatusId === fromStatusId && t.toStatusId === toStatusId
  );

  if (isAllowed) {
    return { valid: true };
  }

  const allowedTargets = allowedTransitions
    .filter((t) => t.fromStatusId === fromStatusId)
    .map((t) => t.toStatusId);

  return {
    valid: false,
    error: "TRANSITION_NOT_ALLOWED",
    message: `Transition from current status to requested status is not allowed`,
    allowedTargets,
  };
}

export function validateNote(note: string): ValidationResult {
  if (!note || !note.trim()) {
    return {
      valid: false,
      error: "NOTE_REQUIRED",
      message: "A status change note is required for all transitions",
    };
  }
  return { valid: true };
}

export function validateResolution(
  flowSlug: string,
  resolution: string | undefined | null
): ValidationResult {
  if (!resolution) {
    return {
      valid: false,
      error: "RESOLUTION_REQUIRED",
      message: "A resolution is required when closing a task",
    };
  }

  const validResolutions = RESOLUTIONS[flowSlug];
  if (!validResolutions) {
    return {
      valid: false,
      error: "INVALID_FLOW",
      message: `Unknown flow: ${flowSlug}`,
    };
  }

  if (!validResolutions.includes(resolution)) {
    return {
      valid: false,
      error: "INVALID_RESOLUTION",
      message: `Invalid resolution '${resolution}' for flow '${flowSlug}'`,
      allowedResolutions: validResolutions,
    };
  }

  return { valid: true };
}
