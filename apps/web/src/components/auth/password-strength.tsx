'use client';

import { AnimatePresence, motion } from 'framer-motion';

import { STAGGER, standardTransition } from '~/lib/motion';
import { cn } from '~/lib/utils';

const enum PasswordStrength {
  Weak = 'weak',
  Medium = 'medium',
  Strong = 'strong'
}

interface PasswordStrengthIndicatorProps {
  password: string;
  className?: string;
}

export function getPasswordStrength(password: string): PasswordStrength {
  if (!password) {
    return PasswordStrength.Weak;
  }

  let currentScore = 0;

  if (password.length >= 8) currentScore += 1;
  if (password.length >= 12) currentScore += 1;
  if (/[a-z]/.test(password)) currentScore += 1;
  if (/[A-Z]/.test(password)) currentScore += 1;
  if (/\d/.test(password)) currentScore += 1;
  if (/[!@#$%^&*(),.?":{}|<>]/.test(password)) currentScore += 1;

  if (currentScore <= 2) {
    return PasswordStrength.Weak;
  }

  if (currentScore <= 4) {
    return PasswordStrength.Medium;
  }

  return PasswordStrength.Strong;
}

export function PasswordStrengthIndicator({ password, className }: PasswordStrengthIndicatorProps) {
  const strength = getPasswordStrength(password);

  const getStrengthColor = () => {
    switch (strength) {
      case PasswordStrength.Weak:
        return 'bg-destructive';
      case PasswordStrength.Medium:
        return 'bg-yellow-500';
      case PasswordStrength.Strong:
        return 'bg-green-500';
    }
  };

  const getStrengthColorValues = () => {
    switch (strength) {
      case PasswordStrength.Weak:
        return { hue: 0, saturation: 84, lightness: 60 }; // Red
      case PasswordStrength.Medium:
        return { hue: 45, saturation: 100, lightness: 50 }; // Yellow
      case PasswordStrength.Strong:
        return { hue: 142, saturation: 76, lightness: 36 }; // Green
    }
  };

  const getStrengthText = () => {
    switch (strength) {
      case PasswordStrength.Weak:
        return 'Weak';
      case PasswordStrength.Medium:
        return 'Medium';
      case PasswordStrength.Strong:
        return 'Strong';
    }
  };

  const segments = 3;
  const activeSegments =
    strength === PasswordStrength.Weak ? 1 : strength === PasswordStrength.Medium ? 2 : 3;

  const colorValues = getStrengthColorValues();

  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex gap-1">
        {Array.from({ length: segments }).map((_, i) => (
          <div
            key={i}
            style={
              i < activeSegments
                ? {
                    // @ts-expect-error - CSS custom properties for @property animation
                    '--strength-hue': colorValues.hue,
                    '--strength-saturation': `${colorValues.saturation}%`,
                    '--strength-lightness': `${colorValues.lightness}%`,
                    backgroundColor: `hsl(var(--strength-hue) var(--strength-saturation) var(--strength-lightness))`,
                    transition:
                      '--strength-hue 0.3s ease, --strength-saturation 0.3s ease, --strength-lightness 0.3s ease'
                  }
                : undefined
            }
            className={cn(
              'h-1.5 flex-1 rounded-full',
              i < activeSegments ? '' : 'bg-input transition-colors duration-300'
            )}
          />
        ))}
      </div>
      <AnimatePresence initial={false}>
        {password && (
          <motion.p
            key="password-strength-text"
            initial={{ opacity: 0, y: 4, filter: 'blur(2px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            exit={{ opacity: 0, y: -2, filter: 'blur(2px)' }}
            transition={standardTransition}
            className="text-xs text-muted-foreground"
          >
            Password strength:{' '}
            <span className={cn('font-medium', getStrengthColor().replace('bg-', 'text-'))}>
              {getStrengthText()}
            </span>
          </motion.p>
        )}
      </AnimatePresence>
      <motion.ul
        initial="initial"
        animate="animate"
        className="space-y-1 text-xs text-muted-foreground"
      >
        {[
          { test: password.length >= 8, text: 'At least 8 characters' },
          { test: /[a-z]/.test(password), text: 'One lowercase letter' },
          { test: /[A-Z]/.test(password), text: 'One uppercase letter' },
          { test: /\d/.test(password), text: 'One number' },
          { test: /[!@#$%^&*(),.?":{}|<>]/.test(password), text: 'One special character' }
        ].map(({ test, text }, i) => (
          <motion.li
            key={text}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{
              delay: i * STAGGER.TIGHT,
              duration: 0.25,
              ease: [0.32, 0.72, 0, 1]
            }}
            className={cn(
              'transition-colors duration-200',
              test ? 'text-green-500' : 'text-muted-foreground'
            )}
          >
            {test ? '✓' : '•'} {text}
          </motion.li>
        ))}
      </motion.ul>
    </div>
  );
}

export type { PasswordStrength };
