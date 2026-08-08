import React from "react";
import { View, Text, StyleSheet, ScrollView, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useAuth } from "@/src/context/AuthContext";
import { Button } from "@/src/components/ui";
import { colors, spacing, font, radius } from "@/src/theme/theme";

export default function Configuracoes() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, logout } = useAuth();

  async function onLogout() {
    await logout();
    router.replace("/login");
  }

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => router.back()} testID="settings-back">
          <Ionicons name="chevron-back" size={26} color={colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Minha conta</Text>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{user?.name?.charAt(0).toUpperCase()}</Text>
        </View>
        <Text style={styles.name}>{user?.name}</Text>
        <Text style={styles.role}>{user?.business_name || "Gestor"}</Text>

        <View style={styles.block}>
          <View style={styles.row}>
            <Ionicons name="mail" size={18} color={colors.primary} />
            <View style={{ flex: 1 }}>
              <Text style={styles.rowLabel}>E-mail</Text>
              <Text style={styles.rowValue}>{user?.email}</Text>
            </View>
          </View>
          <View style={styles.row}>
            <Ionicons name="shield-checkmark" size={18} color={colors.primary} />
            <View style={{ flex: 1 }}>
              <Text style={styles.rowLabel}>Perfil</Text>
              <Text style={styles.rowValue}>Gestor / Admin</Text>
            </View>
          </View>
        </View>

        <Button title="Sair da conta" variant="ghost" icon="log-out-outline" onPress={onLogout} testID="admin-logout" />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  headerTitle: { color: colors.text, fontSize: font.title, fontWeight: "800" },
  scroll: { paddingHorizontal: spacing.xl, alignItems: "center", paddingTop: spacing.xl, paddingBottom: 40 },
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
