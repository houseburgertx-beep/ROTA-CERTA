import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, FlatList, Pressable, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useFocusEffect } from "expo-router";
import { api } from "@/src/config/api";
import { Card, StatusBadge, EmptyState } from "@/src/components/ui";
import { colors, spacing, font, radius } from "@/src/theme/theme";
import { brl, PAYMENT_META, STATUS_META, DeliveryStatus } from "@/src/utils/helpers";

type Delivery = {
  id: string;
  customer_name: string;
  address: string;
  payment_method: string;
  order_value: number;
  delivery_fee: number;
  status: DeliveryStatus;
  driver_name?: string;
  max_time?: string;
  sequence?: number;
  address_incomplete?: boolean;
  lat?: number | null;
};

const FILTERS: { key: string; label: string }[] = [
  { key: "todas", label: "Todas" },
  { key: "aguardando", label: "Aguardando" },
  { key: "em_rota", label: "Em rota" },
  { key: "entregue", label: "Entregues" },
  { key: "problema", label: "Problema" },
];

export default function Entregas() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [items, setItems] = useState<Delivery[]>([]);
  const [filter, setFilter] = useState("todas");

  const load = useCallback(async (f: string) => {
    try {
      const data = await api.get(`/deliveries?status_filter=${f}`);
      setItems(data);
    } catch {}
  }, []);

  useFocusEffect(
    useCallback(() => {
      load(filter);
    }, [load, filter])
  );

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Text style={styles.title}>Entregas</Text>
        <Pressable style={styles.addBtn} onPress={() => router.push("/scan")} testID="add-delivery-button">
          <Ionicons name="add" size={22} color={colors.white} />
        </Pressable>
      </View>

      <View style={styles.chipsWrap}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chips}
        >
          {FILTERS.map((f) => {
            const active = filter === f.key;
            return (
              <Pressable
                key={f.key}
                onPress={() => setFilter(f.key)}
                style={[styles.chip, active && styles.chipActive]}
                testID={`filter-${f.key}`}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{f.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      <FlatList
        data={items}
        keyExtractor={(i) => i.id}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <EmptyState
            icon="cube-outline"
            title="Nenhuma entrega"
            subtitle="Toque em + para ler uma comanda por foto e criar a primeira entrega."
            testID="empty-deliveries"
          />
        }
        renderItem={({ item }) => (
          <Card
            style={styles.card}
            onPress={() => router.push(`/entrega/${item.id}`)}
            testID={`delivery-card-${item.id}`}
          >
            <View style={styles.cardTop}>
              <View style={styles.customerRow}>
                {item.sequence ? (
                  <View style={styles.seq}>
                    <Text style={styles.seqText}>{item.sequence}</Text>
                  </View>
                ) : null}
                <Text style={styles.customer} numberOfLines={1}>
                  {item.customer_name}
                </Text>
              </View>
              <StatusBadge status={item.status} />
            </View>

            <View style={styles.addrRow}>
              <Ionicons
                name="location"
                size={15}
                color={item.address_incomplete ? colors.problema : colors.textDim}
              />
              <Text style={styles.addr} numberOfLines={2}>
                {item.address || "Endereço não informado"}
              </Text>
            </View>

            <View style={styles.cardBottom}>
              <View style={styles.pay}>
                <Ionicons name={PAYMENT_META[item.payment_method]?.icon as any || "cash-outline"} size={14} color={colors.textMuted} />
                <Text style={styles.payText}>{PAYMENT_META[item.payment_method]?.label || item.payment_method}</Text>
              </View>
              <Text style={styles.fee}>{brl(item.delivery_fee)} <Text style={styles.feeLabel}>taxa</Text></Text>
              {item.driver_name ? (
                <View style={styles.driverPill}>
                  <Ionicons name="person" size={12} color={colors.textMuted} />
                  <Text style={styles.driverName} numberOfLines={1}>{item.driver_name}</Text>
                </View>
              ) : null}
            </View>
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
  chipsWrap: { height: 56, justifyContent: "center" },
  chips: { paddingHorizontal: spacing.xl, gap: 8, alignItems: "center" },
  chip: {
    height: 36,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.textMuted, fontSize: font.small, fontWeight: "700" },
  chipTextActive: { color: colors.white },
  list: { paddingHorizontal: spacing.xl, paddingTop: spacing.sm, paddingBottom: 32 },
  card: { marginBottom: spacing.md },
  cardTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.md },
  customerRow: { flexDirection: "row", alignItems: "center", flex: 1, marginRight: 8 },
  seq: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
  },
  seqText: { color: colors.primary, fontSize: font.tiny, fontWeight: "800" },
  customer: { color: colors.text, fontSize: font.title, fontWeight: "800", flex: 1 },
  addrRow: { flexDirection: "row", alignItems: "flex-start", gap: 6, marginBottom: spacing.md },
  addr: { color: colors.textMuted, fontSize: font.small, flex: 1, lineHeight: 19 },
  cardBottom: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  pay: { flexDirection: "row", alignItems: "center", gap: 4 },
  payText: { color: colors.textMuted, fontSize: font.small },
  fee: { color: colors.text, fontSize: font.body, fontWeight: "800" },
  feeLabel: { color: colors.textDim, fontSize: font.tiny, fontWeight: "600" },
  driverPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginLeft: "auto",
    maxWidth: 120,
  },
  driverName: { color: colors.textMuted, fontSize: font.small },
});
