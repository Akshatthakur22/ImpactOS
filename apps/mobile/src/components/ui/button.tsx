import React from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  TextStyle,
  ViewStyle,
} from "react-native";
import { colors, radii, spacing, typography } from "@/lib/theme";

export type ButtonVariant = "primary" | "secondary" | "outline" | "ghost" | "danger" | "success";
export type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  icon?: React.ReactNode;
}

export function Button({
  title,
  onPress,
  variant = "primary",
  size = "md",
  disabled = false,
  loading = false,
  style,
  textStyle,
  icon,
}: ButtonProps) {
  const isActionDisabled = disabled || loading;

  const getContainerStyle = () => {
    switch (variant) {
      case "primary":
        return styles.primaryContainer;
      case "secondary":
        return styles.secondaryContainer;
      case "outline":
        return styles.outlineContainer;
      case "danger":
        return styles.dangerContainer;
      case "success":
        return styles.successContainer;
      case "ghost":
        return styles.ghostContainer;
    }
  };

  const getTextStyle = () => {
    switch (variant) {
      case "primary":
        return styles.primaryText;
      case "secondary":
        return styles.secondaryText;
      case "outline":
        return styles.outlineText;
      case "danger":
        return styles.dangerText;
      case "success":
        return styles.successText;
      case "ghost":
        return styles.ghostText;
    }
  };

  const getSizeStyle = () => {
    switch (size) {
      case "sm":
        return styles.sizeSm;
      case "lg":
        return styles.sizeLg;
      case "md":
      default:
        return styles.sizeMd;
    }
  };

  const getSpinnerColor = () => {
    switch (variant) {
      case "primary":
      case "danger":
      case "success":
        return "#FFFFFF";
      case "secondary":
      case "outline":
      case "ghost":
      default:
        return colors.brand;
    }
  };

  return (
    <Pressable
      onPress={onPress}
      disabled={isActionDisabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: isActionDisabled, busy: loading }}
      style={({ pressed }) => [
        styles.base,
        getContainerStyle(),
        getSizeStyle(),
        pressed && !isActionDisabled && styles.pressed,
        isActionDisabled && styles.disabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={getSpinnerColor()} />
      ) : (
        <>
          {icon}
          <Text style={[getTextStyle(), size === "sm" && styles.textSm, textStyle]}>
            {title}
          </Text>
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radii.md,
    gap: spacing.xs + 2,
    minHeight: 44, // Touch target minimum
  },
  sizeSm: {
    minHeight: 36,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radii.sm,
  },
  sizeMd: {
    minHeight: 44,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2,
  },
  sizeLg: {
    minHeight: 52,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: radii.lg,
  },
  // Variant containers
  primaryContainer: {
    backgroundColor: colors.brand,
  },
  secondaryContainer: {
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: colors.border,
  },
  outlineContainer: {
    backgroundColor: "transparent",
    borderWidth: 1.5,
    borderColor: colors.brand,
  },
  dangerContainer: {
    backgroundColor: colors.danger,
  },
  successContainer: {
    backgroundColor: colors.success,
  },
  ghostContainer: {
    backgroundColor: "transparent",
  },
  // Text styles
  primaryText: {
    ...typography.headline,
    color: "#FFFFFF",
    fontSize: 15,
  },
  secondaryText: {
    ...typography.headline,
    color: colors.ink,
    fontSize: 15,
  },
  outlineText: {
    ...typography.headline,
    color: colors.brand,
    fontSize: 15,
  },
  dangerText: {
    ...typography.headline,
    color: "#FFFFFF",
    fontSize: 15,
  },
  successText: {
    ...typography.headline,
    color: "#FFFFFF",
    fontSize: 15,
  },
  ghostText: {
    ...typography.headline,
    color: colors.brand,
    fontSize: 15,
  },
  textSm: {
    fontSize: 13,
  },
  pressed: {
    opacity: 0.85,
    transform: [{ scale: 0.985 }],
  },
  disabled: {
    opacity: 0.45,
  },
});
