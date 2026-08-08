import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useLocalSearchParams } from "expo-router";
import { api } from "@/src/config/api";
import { Button, Field } from "@/src/components/ui";
import { colors, spacing, font, radius } from "@/src/theme/theme";
import { PAYMENT_META } from "@/src/utils/helpers";

const PAYMENTS = ["dinheiro", "cartao", "pix"];

export default function Review() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<Record<string, string>>();

  const [customer, setCustomer] = useState("");
  const [address, setAddress] = useState("");
  const [payment, setPayment] = useState("dinheiro");
  const [orderValue, setOrderValue] = useState("");
  const [fee, setFee] = useState("");
  const [notes, setNotes] = useState("");
  const [maxTime, setMaxTime] = useState("");
  const [drivers, setDrivers] = useState<any[]>([]);
  const [driverId, setDriverId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const incomplete = params.address_incomplete === "1";

  useEffect(() => {
    if (params.customer_name) setCustomer(params.customer_name);
    if (params.address) setAddress(params.address);
    if (params.payment_method) setPayment(params.payment_method);
    if (params.order_value && params.order_value !== "0") setOrderValue(params.order_value);
    if (params.delivery_fee && params.delivery_fee !== "0") setFee(params.delivery_fee);
    if (params.notes) setNotes(params.notes);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    (async () => {
      try {
        setDrivers(await api.get("/drivers"));
      } catch {}
    })();
  }, []);

  async function onSave() {
    setError("");
    if (!customer || !address) {
      setError("Informe cliente e endereço");
      return;
    }
    setLoading(true);
    try {
      await api.post("/deliveries", {
        customer_name: customer,
        address,
        payment_method: payment,
        order_value: parseFloat(orderValue.replace(",", ".")) || 0,
        delivery_fee: parseFloat(fee.replace(",", ".")) || 0,
        notes,
        max_time: maxTime || null,
        driver_id: driverId,
      });
      router.replace("/(admin)/entregas");
    } catch (e: any) {
      setError(e.message || "Erro ao salvar entrega");
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => router.back()} testID="review-close">
          <Ionicons name="chevron-back" size={26} color={colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Revisar entrega</Text>
        <View style={{ width: 26 }} />
      </View>

      <KeyboardAwareScrollView
        contentContainerStyle={styles.scroll}
        bottomOffset={90}
        keyboardShouldPersistTaps="handled"
      >
        <Field label="Cliente" icon="person-outline" placeholder="Nome do cliente" value={customer} onChangeText={setCustomer} testID="review-customer-input" />

        <Field label="Endereço" icon="location-outline" placeholder="Rua, número, bairro, cidade" value={address} onChangeText={setAddress} multiline testID="review-address-input" />
        {incomplete && (
          <View style={styles.warn} testID="review-address-warning">
            <Ionicons name="warning" size={15} color={colors.aguardando} />
            <Text style={styles.warnText}>Endereço pode estar incompleto — confira antes de salvar.</Text>
          </View>
        )}

        <Text style={styles.label}>Forma de pagamento</Text>
        <View style={styles.payRow}>
          {PAYMENTS.map((p) => {
            const on = payment === p;
            return (
              <Pressable key={p} style={[styles.payChip, on && styles.payChipOn]} onPress={() => setPayment(p)} testID={`review-payment-${p}`}>
                <Ionicons name={PAYMENT_META[p].icon as any} size={16} color={on ? colors.white : colors.textMuted} />
                <Text style={[styles.payChipText, on && { color: colors.white }]}>{PAYMENT_META[p].label}</Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.twoCol}>
          <View style={{ flex: 1 }}>
            <Field label="Taxa de entrega (R$)" icon="pricetag-outline" placeholder="0,00" keyboardType="decimal-pad" value={fee} onChangeText={setFee} testID="review-fee-input" />
          </View>
          <View style={{ width: spacing.md }} />
          <View style={{ flex: 1 }}>
            <Field label="Valor do pedido (R$)" icon="receipt-outline" placeholder="0,00" keyboardType="decimal-pad" value={orderValue} onChangeText={setOrderValue} testID="review-order-input" />
          </View>
        </View>

        <Field label="Horário máximo (opcional)" icon="time-outline" placeholder="Ex: 20:30" value={maxTime} onChangeText={setMaxTime} testID="review-time-input" />
        <Field label="Observações (opcional)" icon="chatbox-outline" placeholder="Complemento, ponto de referência…" value={notes} onChangeText={setNotes} multiline testID="review-notes-input" />

        <Text style={styles.label}>Atribuir a um motoboy (opcional)</Text>
        <View style={styles.driverWrap}>
          <Pressable style={[styles.driverOpt, !driverId && styles.driverOptOn]} onPress={() => setDriverId(null)} testID="review-driver-none">
            <Text style={[styles.driverOptText, !driverId && { color: colors.white }]}>Depois</Text>
          </Pressable>
          {drivers.map((d) => {
            const on = driverId === d.id;
            return (
              <Pressable key={d.id} style={[styles.driverOpt, on && styles.driverOptOn]} onPress={() => setDriverId(d.id)} testID={`review-driver-${d.id}`}>
                <Text style={[styles.driverOptText, on && { color: colors.white }]}>{d.name.split(" ")[0]}</Text>
              </Pressable>
            );
          })}
        </View>

        {error ? <Text style={styles.error} testID="review-error">{error}</Text> : null}

        <Button title="Confirmar entrega" onPress={onSave} loading={loading} testID="review-save-button" />
      </KeyboardAwareScrollView>
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
  scroll: { paddingHorizontal: spacing.xl, paddingTop: spacing.lg, paddingBottom: 40 },
  label: { color: colors.textMuted, fontSize: font.small, fontWeight: "600", marginBottom: spacing.sm },
  warn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.aguardandoBg,
    borderRadius: radius.sm,
    padding: spacing.md,
    marginTop: -spacing.sm,
    marginBottom: spacing.lg,
  },
  warnText: { color: colors.aguardando, fontSize: font.small, flex: 1 },
  payRow: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.lg },
  payChip: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    height: 46,
    borderRadius: radius.md,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
  },
  payChipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  payChipText: { color: colors.textMuted, fontSize: font.small, fontWeight: "700" },
  twoCol: { flexDirection: "row" },
  driverWrap: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginBottom: spacing.xl },
  driverOpt: {
    paddingHorizontal: spacing.lg,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  driverOptOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  driverOptText: { color: colors.textMuted, fontSize: font.small, fontWeight: "700" },
  error: { color: colors.problema, fontSize: font.small, marginBottom: spacing.md, textAlign: "center" },
});
