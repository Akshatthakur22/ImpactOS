import { StyleSheet, Text, View } from "react-native";

export type WorkspaceIconName =
  | "home"
  | "calendar"
  | "attendance"
  | "progress"
  | "wallet"
  | "profile"
  | "students"
  | "bell";

/** Small, consistent line icons shared by the parent and coach workspaces. */
export function WorkspaceIcon({
  name,
  color,
  size = 22,
}: {
  name: WorkspaceIconName;
  color: string;
  size?: number;
}) {
  const scale = size / 22;
  const style = (value: object) => [value, { transform: [{ scale }] }];

  if (name === "attendance")
    return (
      <View style={style([styles.circle, { borderColor: color }])}>
        <Text style={[styles.check, { color }]}>✓</Text>
      </View>
    );
  if (name === "calendar")
    return (
      <View style={style([styles.calendar, { borderColor: color }])}>
        <View style={[styles.calendarTop, { borderColor: color }]} />
        <View style={styles.calendarGrid}>
          {[0, 1, 2, 3].map((item) => (
            <View key={item} style={[styles.calendarCell, { backgroundColor: color }]} />
          ))}
        </View>
      </View>
    );
  if (name === "progress")
    return (
      <View style={style(styles.bars)}>
        {[8, 13, 18].map((height, index) => (
          <View key={index} style={{ width: 3, height, borderRadius: 2, backgroundColor: color }} />
        ))}
      </View>
    );
  if (name === "wallet")
    return (
      <View style={style([styles.wallet, { borderColor: color }])}>
        <View style={[styles.walletFlap, { backgroundColor: color }]} />
        <View style={[styles.walletDot, { backgroundColor: color }]} />
      </View>
    );
  if (name === "bell")
    return (
      <View style={style(styles.bell)}>
        <View style={[styles.bellDome, { borderColor: color }]} />
        <View style={[styles.bellLip, { borderColor: color }]} />
        <View style={[styles.bellClapper, { backgroundColor: color }]} />
      </View>
    );
  if (name === "profile" || name === "students")
    return (
      <View style={style(styles.personIcon)}>
        <View style={[styles.personHead, { borderColor: color }]} />
        <View style={[styles.personBody, { borderColor: color }]} />
        {name === "students" ? <View style={[styles.personSecond, { borderColor: color }]} /> : null}
      </View>
    );
  return (
    <View style={style(styles.home)}>
      <View style={[styles.homeRoof, { borderColor: color }]} />
      <View style={[styles.homeBody, { borderColor: color }]}>
        <View style={[styles.homeDoor, { backgroundColor: color }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  circle: { width: 19, height: 19, borderRadius: 10, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  check: { fontSize: 12, fontWeight: "800", lineHeight: 14 },
  calendar: { width: 19, height: 18, borderRadius: 4, borderWidth: 2, marginTop: 3 },
  calendarTop: { height: 4, borderBottomWidth: 2, borderTopWidth: 2, marginTop: -3 },
  calendarGrid: { flex: 1, flexDirection: "row", flexWrap: "wrap", gap: 2, padding: 3 },
  calendarCell: { width: 3, height: 3, borderRadius: 1 },
  bars: { height: 20, flexDirection: "row", alignItems: "flex-end", gap: 3 },
  wallet: { width: 20, height: 15, borderRadius: 4, borderWidth: 2, marginTop: 2 },
  walletFlap: { position: "absolute", right: -2, top: 3, width: 9, height: 7, borderRadius: 2 },
  walletDot: { position: "absolute", right: 2, top: 5, width: 3, height: 3, borderRadius: 2 },
  bell: { width: 22, height: 22, alignItems: "center", justifyContent: "center" },
  bellDome: { position: "absolute", top: 2, width: 14, height: 15, borderWidth: 2, borderBottomWidth: 0, borderTopLeftRadius: 8, borderTopRightRadius: 8 },
  bellLip: { position: "absolute", top: 14, width: 18, height: 4, borderWidth: 2, borderRadius: 4 },
  bellClapper: { position: "absolute", top: 18, width: 4, height: 2, borderRadius: 2 },
  personIcon: { width: 22, height: 22, alignItems: "center" },
  personHead: { width: 8, height: 8, borderRadius: 5, borderWidth: 2 },
  personBody: { position: "absolute", bottom: 1, width: 17, height: 9, borderWidth: 2, borderBottomWidth: 0, borderTopLeftRadius: 9, borderTopRightRadius: 9 },
  personSecond: { position: "absolute", right: -1, bottom: 1, width: 10, height: 7, borderWidth: 1.5, borderBottomWidth: 0, borderTopLeftRadius: 6, borderTopRightRadius: 6 },
  home: { width: 21, height: 21, alignItems: "center", justifyContent: "flex-end" },
  homeRoof: { position: "absolute", top: 3, width: 14, height: 14, borderLeftWidth: 2, borderTopWidth: 2, transform: [{ rotate: "45deg" }] },
  homeBody: { width: 17, height: 12, borderWidth: 2, borderTopWidth: 0, borderBottomLeftRadius: 3, borderBottomRightRadius: 3, alignItems: "center", justifyContent: "flex-end" },
  homeDoor: { width: 4, height: 7, borderTopLeftRadius: 2, borderTopRightRadius: 2 },
});
