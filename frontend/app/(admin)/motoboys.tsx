import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, FlatList, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useFocusEffect } from "expo-router";
import { api } from "@/src/config/api";
import { Card, EmptyState } from "@/src/components/ui";
import { colors, spacing, font, radius } from "@/src/theme/theme";

type Driver = {
  id: string;
  name: string;
  email: string;
  phone?: string;
  vehicle?: string;
  active: boolean;
  active_deliveries: number;
};

export default function Motoboys() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [items, setItems] = useState<Driver[]>([]);

  const load = useCallback(async () => {
    try {
      setItems(await api.get("/drivers"));
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
        <Text style={styles.title}>Motoboys</Text>
        <Pressable
          style={styles.addBtn}
          onPress={() => router.push("/motoboy-form")}
          testID="add-motoboy-button"
        >
          <Ionicons name="person-add" size={19} color={colors.white} />
        </Pressable>
      </View>

      <FlatList
        data={items}
        keyExtractor={(i) => i.id}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <EmptyState
            icon="people-outline"
            title="Nenhum motoboy"
            subtitle="Cadastre seus entregadores para atribuir rotas e acompanhar entregas."
            testID="empty-drivers"
          />
        }
        renderItem={({ item }) => (
          <Card
            style={styles.card}
            onPress={() => router.push({ pathname: "/motoboy-form", params: { id: item.id } })}
            testID={`driver-card-${item.id}`}
          >
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {item.name.charAt(0).toUpperCase()}
              </Text>
              <View style={[styles.statusDot, { backgroundColor: item.active ? colors.entregue : colors.textDim }]} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
              <Text style={styles.sub} numberOfLines={1}>
                {item.vehicle || "Veículo não informado"}
                {item.phone ? ` • ${item.phone}` : ""}
              </Text>
            </View>
            <View style={styles.countBox}>
              <Text style={styles.count}>{item.active_deliveries}</Text>
              <Text style={styles.countLabel}>ativas</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textDim} />
          </Card>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.md,
  },
  title: { color: colors.text, fontSize: font.h2, fontWeight: "900" },
  addBtn: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  list: { paddingHorizontal: spacing.xl, paddingTop: spacing.sm, paddingBottom: 32 },
  card: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginBottom: spacing.md },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { color: colors.primary, fontSize: font.h3, fontWeight: "900" },
  statusDot: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: colors.surface,
  },
  name: { color: colors.text, fontSize: font.title, fontWeight: "800" },
  sub: { color: colors.textMuted, fontSize: font.small, marginTop: 2 },
  countBox: { alignItems: "center", minWidth: 40 },
  count: { color: colors.primary, fontSize: font.h3, fontWeight: "900" },
  countLabel: { color: colors.textDim, fontSize: font.tiny },
});
