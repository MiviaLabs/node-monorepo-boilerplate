/**
 * Motion System - Linear-Style Premium Animations
 *
 * Shared animation variants and configuration for consistent, accessible motion design.
 * Based on Emil Kowalski (restraint), Jakub Krehel (production polish), and Jhey Tompkins (selective delight).
 *
 * Principles:
 * - Fast durations (under 300ms) for productivity
 * - Opacity + translateY + blur for enter/exit
 * - Exits subtler than enters
 * - Full prefers-reduced-motion support
 */

import type { Transition, Variants } from 'framer-motion';

// ============================================================================
// TIMING CONSTANTS
// ============================================================================

/**
 * Duration guidelines based on Emil Kowalski's productivity-first approach
 */
export const DURATIONS = {
  /** Instant feedback (button press, checkbox toggle) */
  INSTANT: 0.1,
  /** Fast UI transitions (hover states, icon swaps) */
  FAST: 0.15,
  /** Standard UI animations (modals, dropdowns, alerts) */
  STANDARD: 0.25,
  /** Smooth transitions (page transitions, large content) */
  SMOOTH: 0.3,
  /** Delighters (celebrations, rare interactions) */
  DELIGHT: 0.45
} as const;

/**
 * Stagger delays for sequential animations
 */
export const STAGGER = {
  /** Tight stagger (table rows, list items) */
  TIGHT: 0.03,
  /** Medium stagger (form fields, cards) */
  MEDIUM: 0.05,
  /** Loose stagger (sections, major elements) */
  LOOSE: 0.08
} as const;

// ============================================================================
// SPRING CONFIGURATIONS
// ============================================================================

/**
 * Spring configurations for natural motion
 */
export const SPRINGS = {
  /** Snappy, professional spring (no bounce) - Jakub's preference */
  PROFESSIONAL: {
    type: 'spring' as const,
    duration: DURATIONS.STANDARD,
    bounce: 0
  },
  /** Slightly bouncy spring for playful moments */
  PLAYFUL: {
    type: 'spring' as const,
    duration: DURATIONS.SMOOTH,
    bounce: 0.1
  },
  /** Delightful spring for celebrations */
  DELIGHT: {
    type: 'spring' as const,
    duration: DURATIONS.DELIGHT,
    bounce: 0.3
  }
} as const;

// ============================================================================
// ENTER/EXIT VARIANTS (Jakub's Recipe)
// ============================================================================

/**
 * Standard enter animation: opacity + translateY + blur
 * Jakub's production-ready recipe
 */
export const fadeInUp: Variants = {
  initial: {
    opacity: 0,
    y: 8,
    filter: 'blur(4px)'
  },
  animate: {
    opacity: 1,
    y: 0,
    filter: 'blur(0px)'
  },
  exit: {
    opacity: 0,
    y: -8, // Subtler exit (Emil + Jakub principle)
    filter: 'blur(4px)'
  }
};

/**
 * Alert enter/exit (appears from bottom, exits subtly)
 */
export const alertVariants: Variants = {
  initial: {
    opacity: 0,
    y: 12,
    filter: 'blur(4px)',
    scale: 0.95
  },
  animate: {
    opacity: 1,
    y: 0,
    filter: 'blur(0px)',
    scale: 1
  },
  exit: {
    opacity: 0,
    y: -8,
    filter: 'blur(4px)',
    scale: 0.98
  }
};

/**
 * Dialog/Modal enter/exit
 */
export const dialogVariants: Variants = {
  initial: {
    opacity: 0,
    scale: 0.95,
    filter: 'blur(4px)'
  },
  animate: {
    opacity: 1,
    scale: 1,
    filter: 'blur(0px)'
  },
  exit: {
    opacity: 0,
    scale: 0.98,
    filter: 'blur(4px)'
  }
};

/**
 * Dropdown menu enter/exit (origin-aware)
 */
export const dropdownVariants: Variants = {
  initial: {
    opacity: 0,
    scale: 0.95,
    y: -8,
    filter: 'blur(4px)'
  },
  animate: {
    opacity: 1,
    scale: 1,
    y: 0,
    filter: 'blur(0px)'
  },
  exit: {
    opacity: 0,
    scale: 0.98,
    y: -4,
    filter: 'blur(4px)'
  }
};

/**
 * Icon swap animation (Copy → Check, Send → Loader2)
 */
export const iconSwapVariants: Variants = {
  initial: {
    opacity: 0,
    scale: 0.8,
    filter: 'blur(4px)'
  },
  animate: {
    opacity: 1,
    scale: 1,
    filter: 'blur(0px)'
  },
  exit: {
    opacity: 0,
    scale: 0.8,
    filter: 'blur(4px)'
  }
};

/**
 * Table row enter/exit with stagger support
 */
export const tableRowVariants: Variants = {
  initial: {
    opacity: 0,
    y: 8,
    filter: 'blur(4px)'
  },
  animate: {
    opacity: 1,
    y: 0,
    filter: 'blur(0px)'
  },
  exit: {
    opacity: 0,
    y: -8,
    filter: 'blur(4px)'
  }
};

/**
 * Form field staggered entrance
 */
export const formFieldVariants: Variants = {
  initial: {
    opacity: 0,
    y: 8,
    filter: 'blur(4px)'
  },
  animate: {
    opacity: 1,
    y: 0,
    filter: 'blur(0px)'
  }
};

/**
 * Success celebration animation (Jhey-inspired delight)
 * Use for rare, high-stakes moments like password reset success
 */
export const celebrationVariants: Variants = {
  initial: {
    opacity: 0,
    scale: 0.8,
    filter: 'blur(4px)'
  },
  animate: {
    opacity: 1,
    scale: [0.8, 1.05, 1],
    filter: 'blur(0px)',
    transition: {
      duration: DURATIONS.DELIGHT,
      scale: {
        times: [0, 0.6, 1],
        ease: 'easeOut'
      }
    }
  },
  exit: {
    opacity: 0,
    scale: 0.95,
    filter: 'blur(4px)'
  }
};

// ============================================================================
// TRANSITIONS
// ============================================================================

/**
 * Fast transition for high-frequency interactions
 */
export const fastTransition: Transition = {
  duration: DURATIONS.FAST,
  ease: [0.32, 0.72, 0, 1] // Ionic/iOS curve (Emil's recommendation)
};

/**
 * Standard transition for UI elements
 */
export const standardTransition: Transition = SPRINGS.PROFESSIONAL;

/**
 * Smooth transition for large content
 */
export const smoothTransition: Transition = {
  duration: DURATIONS.SMOOTH,
  ease: [0.32, 0.72, 0, 1]
};

/**
 * Icon swap transition (fast and snappy)
 */
export const iconSwapTransition: Transition = {
  duration: DURATIONS.FAST,
  ease: [0.32, 0.72, 0, 1]
};

// ============================================================================
// STAGGER CONTAINERS
// ============================================================================

/**
 * Container variant for staggered children
 * @param delay - Delay between child animations in seconds.
 * @returns Motion variants configured with staggered child transitions.
 */
export const staggerContainer = (delay = STAGGER.MEDIUM): Variants => ({
  animate: {
    transition: {
      staggerChildren: delay
    }
  }
});

/**
 * Table container with tight stagger
 */
export const tableContainer: Variants = {
  animate: {
    transition: {
      staggerChildren: STAGGER.TIGHT
    }
  }
};

/**
 * Form container with medium stagger
 */
export const formContainer: Variants = {
  animate: {
    transition: {
      staggerChildren: STAGGER.MEDIUM
    }
  }
};

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Check if user prefers reduced motion
 * @returns True when the user has enabled reduced motion at OS/browser level.
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Get transition with reduced motion support
 * @param transition - Transition to use when reduced motion is not enabled.
 * @returns Reduced-motion-safe transition configuration.
 */
export function getTransition(transition: Transition): Transition {
  if (prefersReducedMotion()) {
    return {
      duration: 0.01
    };
  }
  return transition;
}

/**
 * Get variants with reduced motion support
 * @param variants - Motion variants to normalize for reduced-motion users.
 * @returns Variants with instant transitions when reduced motion is enabled.
 */
export function getVariants(variants: Variants): Variants {
  if (prefersReducedMotion()) {
    // Return instant variants (no animation)
    const instantVariant = variants.animate ?? variants.initial ?? {};
    return {
      initial: instantVariant,
      animate: instantVariant,
      exit: instantVariant
    };
  }
  return variants;
}
