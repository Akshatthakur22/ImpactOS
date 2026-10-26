import { Platform } from "react-native";

export const colors = {
  // Brand foundations
  brand: "#007AFF",
  brandDark: "#0066D6",
  brandSoft: "#EBF5FF",
  brandText: "#0051A8",

  // Core canvas & surfaces (iOS-inspired light mode)
  canvas: "#F2F2F7",
  surface: "#FFFFFF",
  surfaceSubtle: "#F9F9FB",
  surfaceElevated: "#FFFFFF",

  // Typography & ink
  ink: "#1D1D1F",
  textSecondary: "#6E6E73",
  muted: "#8E8E93",
  mutedLight: "#AEAEB2",

  // Borders & dividers
  border: "#E5E5EA",
  borderLight: "#F2F2F7",
  borderStrong: "#D1D1D6",

  // Semantic state tokens
  success: "#34C759",
  successSoft: "#E8F8EE",
  successText: "#1B873F",

  warning: "#FF9500",
  warningSoft: "#FFF4E5",
  warningText: "#B26200",

  danger: "#FF3B30",
  dangerSoft: "#FFF1F0",
  dangerText: "#D70015",

  info: "#007AFF",
  infoSoft: "#EBF5FF",
  infoText: "#0051A8",

  // Sports & Category Accents
  football: "#34C759",
  basketball: "#FF9500",
  swimming: "#007AFF",
  martialArts: "#5856D6",
  badminton: "#FF2D55",
} as const;

export const spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  huge: 40,
} as const;

export const radii = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  full: 9999,
} as const;

export const typography = {
  title1: {
    fontSize: 24,
    fontWeight: "700" as const,
    lineHeight: 30,
    color: colors.ink,
    letterSpacing: -0.3,
  },
  title2: {
    fontSize: 20,
    fontWeight: "700" as const,
    lineHeight: 26,
    color: colors.ink,
    letterSpacing: -0.2,
  },
  title3: {
    fontSize: 18,
    fontWeight: "600" as const,
    lineHeight: 24,
    color: colors.ink,
  },
  headline: {
    fontSize: 16,
    fontWeight: "600" as const,
    lineHeight: 22,
    color: colors.ink,
  },
  body: {
    fontSize: 14,
    fontWeight: "400" as const,
    lineHeight: 20,
    color: colors.ink,
  },
  bodyMedium: {
    fontSize: 14,
    fontWeight: "500" as const,
    lineHeight: 20,
    color: colors.ink,
  },
  callout: {
    fontSize: 13,
    fontWeight: "500" as const,
    lineHeight: 18,
    color: colors.textSecondary,
  },
  subhead: {
    fontSize: 12,
    fontWeight: "500" as const,
    lineHeight: 16,
    color: colors.textSecondary,
  },
  caption: {
    fontSize: 11,
    fontWeight: "600" as const,
    lineHeight: 14,
    letterSpacing: 0.2,
  },
} as const;

export const shadows = {
  card: Platform.select({
    web: {
      boxShadow: "0 1px 3px rgba(0, 0, 0, 0.04), 0 1px 2px rgba(0, 0, 0, 0.02)",
    },
    default: {
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.04,
      shadowRadius: 3,
      elevation: 1,
    },
  }),
  elevated: Platform.select({
    web: {
      boxShadow: "0 4px 12px rgba(0, 0, 0, 0.08)",
    },
    default: {
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.08,
      shadowRadius: 8,
      elevation: 3,
    },
  }),
} as const;
