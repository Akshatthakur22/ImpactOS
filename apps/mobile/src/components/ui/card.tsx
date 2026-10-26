import React from "react";
import {
  Pressable,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from "react-native";
import { colors, radii, shadows, spacing } from "@/lib/theme";

interface CardProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  disabled?: boolean;
  elevated?: boolean;
}

export function Card({
  children,
  style,
  onPress,
  disabled = false,
  elevated = false,
}: CardProps) {
  const cardStyle = [
    styles.card,
    elevated ? shadows.elevated : shadows.card,
    style,
  ];

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        disabled={disabled}
        accessibilityRole="button"
        style={({ pressed }) => [
          cardStyle,
          pressed && !disabled && styles.pressed,
          disabled && styles.disabled,
        ]}
      >
        {children}
      </Pressable>
    );
  }

  return <View style={cardStyle}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    overflow: "hidden",
  },
  pressed: {
    opacity: 0.9,
    backgroundColor: colors.surfaceSubtle,
  },
  disabled: {
    opacity: 0.6,
  },
});
