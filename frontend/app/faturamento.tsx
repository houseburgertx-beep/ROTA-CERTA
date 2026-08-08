import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useFocusEffect } from "expo-router";
import { api } from "@/src/config/api";
import { Card } from "@/src/components/ui";
import { colors, spacing, font, radius } from "@/src/theme/theme";
import { brl } from "@/src/utils/helpers";

export default function Faturamento() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [b, setB] = useState<any>(null);

  const load = useCallback(async () => {
    try {
      setB(await api.get("/billing"));
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
        <Pressable onPress={() => router.back()} testID="billing-back">
          <Ionicons name="chevron-back" size={26} color={colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Faturamento</Text>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Card style={styles.hero}>
          <Text style={styles.heroLabel}>Total previsto em taxas</Text>
          <Text style={styles.heroValue} testID="billing-total">{brl(b?.total_previsto)}</Text>
          <View style={styles.heroSplit}>
            <View style={styles.heroCol}>
              <Text style={[styles.heroColVal, { color: colors.entregue }]}>{brl(b?.taxa_realizada)}</Text>
              <Text style={styles.heroColLabel}>Realizado</Text>
            </View>
            <View style={styles.heroDivider} />
            <View style={styles.heroCol}>
              <Text style={[styles.heroColVal, { color: colors.aguardando }]}>{brl(b?.taxa_aberto)}</Text>
              <Text style={styles.heroColLabel}>Em aberto</Text>
            </View>
          </View>
        </Card>

        <View style={styles.grid}>
          <Metric icon="receipt" label="Valor dos pedidos" value={brl(b?.valor_pedidos)} testID="billing-orders" />
          <Metric icon="cube" label="Total de entregas" value={String(b?.total_entregas ?? 0)} testID="billing-count" />
          <Metric icon="checkmark-done" label="Entregues" value={String(b?.entregues ?? 0)} testID="billing-delivered" />
          <Metric icon="people" label="Motoboys ativos" value={String(b?.motoboys_ativos ?? 0)} testID="billing-drivers" />
        </View>

        <View style={styles.note}>
          <Ionicons name="information-circle" size={16} color={colors.textDim} />
          <Text style={styles.noteText}>
            A taxa de entrega é separada do valor do pedido. O faturamento considera apenas as taxas de entrega.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

function Metric({ icon, label, value, testID }: any) {
  return (
    <Card style={styles.metric} testID={testID}>
      <Ionicons name={icon} size={20} color={colors.primary} />
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </Card>
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
  scroll: { paddingHorizontal: spacing.xl, paddingBottom: 32 },
  hero: { alignItems: "center", paddingVertical: spacing.xxl },
  heroLabel: { color: colors.textMuted, fontSize: font.small },
  heroValue: { color: colors.text, fontSize: 40, fontWeight: "900", marginTop: spacing.xs },
  heroSplit: { flexDirection: "row", alignItems: "center", marginTop: spacing.xl },
  heroCol: { alignItems: "center", paddingHorizontal: spacing.xl },
  heroColVal: { fontSize: font.h3, fontWeight: "800" },
  heroColLabel: { color: colors.textMuted, fontSize: font.small, marginTop: 2 },
  heroDivider: { width: 1, height: 36, backgroundColor: colors.border },
  grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", marginTop: spacing.lg },
  metric: { width: "48.5%", marginBottom: spacing.md, gap: 8 },
  metricValue: { color: colors.text, fontSize: font.h3, fontWeight: "900" },
  metricLabel: { color: colors.textMuted, fontSize: font.small },
  note: { flexDirection: "row", gap: 8, marginTop: spacing.md, paddingHorizontal: spacing.xs },
  noteText: { color: colors.textDim, fontSize: font.small, flex: 1, lineHeight: 18 },
});
