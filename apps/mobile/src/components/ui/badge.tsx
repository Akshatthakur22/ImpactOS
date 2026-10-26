import React from "react";
import { StyleSheet, Text, TextStyle, View, ViewStyle } from "react-native";
import { colors, radii, spacing, typography } from "@/lib/theme";

export type BadgeVariant =
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "neutral"
  | "brand";

interface BadgeProps {
  label: string;
  variant?: BadgeVariant;
  style?: ViewStyle;
  textStyle?: TextStyle;
  icon?: React.ReactNode;
  dot?: boolean;
}

export function Badge({
  label,
  variant = "neutral",
  style,
  textStyle,
  icon,
  dot = false,
}: BadgeProps) {
  const getVariantStyles = () => {
    switch (variant) {
      case "success":
        return {
          container: styles.successContainer,
          text: styles.successText,
          dot: styles.successDot,
        };
      case "warning":
        return {
          container: styles.warningContainer,
          text: styles.warningText,
          dot: styles.warningDot,
        };
      case "danger":
        return {
          container: styles.dangerContainer,
          text: styles.dangerText,
          dot: styles.dangerDot,
        };
      case "info":
        return {
          container: styles.infoContainer,
          text: styles.infoText,
          dot: styles.infoDot,
        };
      case "brand":
        return {
          container: styles.brandContainer,
          text: styles.brandText,
          dot: styles.brandDot,
        };
      case "neutral":
      default:
        return {
          container: styles.neutralContainer,
          text: styles.neutralText,
          dot: styles.neutralDot,
        };
    }
  };

  const vStyles = getVariantStyles();

  return (
    <View style={[styles.base, vStyles.container, style]}>
      {dot && <View style={[styles.dotBase, vStyles.dot]} />}
      {icon}
      <Text style={[styles.textBase, vStyles.text, textStyle]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs,
    borderRadius: radii.full,
    gap: spacing.xs,
    alignSelf: "flex-start",
  },
  dotBase: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  textBase: {
    ...typography.caption,
    textTransform: "capitalize",
    fontWeight: "700",
  },
  // Success
  successContainer: {
    backgroundColor: colors.successSoft,
  },
  successText: {
    color: colors.successText,
  },
  successDot: {
    backgroundColor: colors.success,
  },
  // Warning
  warningContainer: {
    backgroundColor: colors.warningSoft,
  },
  warningText: {
    color: colors.warningText,
  },
  warningDot: {
    backgroundColor: colors.warning,
  },
  // Danger
  dangerContainer: {
    backgroundColor: colors.dangerSoft,
  },
  dangerText: {
    color: colors.dangerText,
  },
  dangerDot: {
    backgroundColor: colors.danger,
  },
  // Info
  infoContainer: {
    backgroundColor: colors.infoSoft,
  },
  infoText: {
    color: colors.infoText,
  },
  infoDot: {
    backgroundColor: colors.info,
  },
  // Brand
  brandContainer: {
    backgroundColor: colors.brandSoft,
  },
  brandText: {
    color: colors.brandText,
  },
  brandDot: {
    backgroundColor: colors.brand,
  },
  // Neutral
  neutralContainer: {
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: colors.border,
  },
  neutralText: {
    color: colors.textSecondary,
  },
  dotNeutral: {
    backgroundColor: colors.muted,
  },
  neutralDot: {
    backgroundColor: colors.muted,
  },
});
