import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { api } from "@/src/config/api";
import { EmptyState } from "@/src/components/ui";
import { colors, spacing, font, radius } from "@/src/theme/theme";
import { timeAgo } from "@/src/utils/helpers";

const ICONS: Record<string, { icon: any; color: string }> = {
  assign: { icon: "cube", color: colors.primary },
  route: { icon: "git-network", color: colors.em_rota },
  status: { icon: "sync", color: colors.em_rota },
  problem: { icon: "alert-circle", color: colors.problema },
  info: { icon: "notifications", color: colors.textMuted },
};

export default function Notificacoes() {
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<any[]>([]);

  const load = useCallback(async () => {
    try {
      const data = await api.get("/notifications");
      setItems(data);
      await api.put("/notifications/read_all");
    } catch {}
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Text style={styles.title}>Notificações</Text>
      </View>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {items.length === 0 ? (
          <EmptyState icon="notifications-outline" title="Sem notificações" subtitle="Você verá aqui novas entregas, mudanças de status e alertas." testID="empty-notifications" />
        ) : (
          items.map((n) => {
            const meta = ICONS[n.kind] || ICONS.info;
            return (
              <View key={n.id} style={[styles.item, !n.read && styles.unread]} testID={`notification-${n.id}`}>
                <View style={[styles.icon, { backgroundColor: meta.color + "22" }]}>
                  <Ionicons name={meta.icon} size={18} color={meta.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemTitle}>{n.title}</Text>
                  <Text style={styles.itemBody}>{n.body}</Text>
                </View>
                <Text style={styles.time}>{timeAgo(n.created_at)}</Text>
              </View>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: { paddingHorizontal: spacing.xl, paddingBottom: spacing.md },
  title: { color: colors.text, fontSize: font.h2, fontWeight: "900" },
  scroll: { paddingHorizontal: spacing.xl, paddingBottom: 32 },
  item: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  unread: { borderColor: colors.primary },
  icon: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  itemTitle: { color: colors.text, fontSize: font.body, fontWeight: "700" },
  itemBody: { color: colors.textMuted, fontSize: font.small, marginTop: 2 },
  time: { color: colors.textDim, fontSize: font.tiny },
});
