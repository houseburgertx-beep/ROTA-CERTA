import React from "react";
import { View, Text, StyleSheet, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useAuth } from "@/src/context/AuthContext";
import { Button } from "@/src/components/ui";
import { colors, spacing, font, radius } from "@/src/theme/theme";

export default function Perfil() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, logout } = useAuth();

  async function onLogout() {
    await logout();
    router.replace("/login");
  }

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 24 }]}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{user?.name?.charAt(0).toUpperCase()}</Text>
        </View>
        <Text style={styles.name}>{user?.name}</Text>
        <Text style={styles.role}>Motoboy</Text>

        <View style={styles.block}>
          <Row icon="mail" label="E-mail" value={user?.email} />
          {user?.phone ? <Row icon="call" label="Telefone" value={user.phone} /> : null}
          {user?.vehicle ? <Row icon="bicycle" label="Veículo" value={user.vehicle} /> : null}
        </View>

        <Button title="Sair da conta" variant="ghost" icon="log-out-outline" onPress={onLogout} testID="driver-logout" />
      </ScrollView>
    </View>
  );
}

function Row({ icon, label, value }: any) {
  return (
    <View style={styles.row}>
      <Ionicons name={icon} size={18} color={colors.primary} />
      <View style={{ flex: 1 }}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text style={styles.rowValue}>{value}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  scroll: { paddingHorizontal: spacing.xl, alignItems: "center", paddingBottom: 40 },
  avatar: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.lg,
  },
  avatarText: { color: colors.primary, fontSize: 38, fontWeight: "900" },
  name: { color: colors.text, fontSize: font.h2, fontWeight: "900" },
  role: { color: colors.textMuted, fontSize: font.body, marginTop: 2, marginBottom: spacing.xxl },
  block: {
    width: "100%",
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.lg,
    marginBottom: spacing.xxl,
  },
  row: { flexDirection: "row", gap: spacing.md, alignItems: "center" },
  rowLabel: { color: colors.textDim, fontSize: font.small },
  rowValue: { color: colors.text, fontSize: font.body, fontWeight: "600", marginTop: 1 },
});
