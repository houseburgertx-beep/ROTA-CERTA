import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, Alert } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useLocalSearchParams } from "expo-router";
import { api } from "@/src/config/api";
import { Button, Field } from "@/src/components/ui";
import { colors, spacing, font } from "@/src/theme/theme";

export default function MotoboyForm() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const editing = !!id;

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [vehicle, setVehicle] = useState("");
  const [active, setActive] = useState(true);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!editing) return;
    (async () => {
      try {
        const drivers = await api.get("/drivers");
        const d = drivers.find((x: any) => x.id === id);
        if (d) {
          setName(d.name);
          setEmail(d.email);
          setPhone(d.phone || "");
          setVehicle(d.vehicle || "");
          setActive(d.active);
        }
      } catch {}
    })();
  }, [editing, id]);

  async function onSave() {
    setError("");
    if (!name || (!editing && (!email || !password))) {
      setError("Preencha nome, e-mail e senha");
      return;
    }
    setLoading(true);
    try {
      if (editing) {
        await api.put(`/drivers/${id}`, { name, phone, vehicle, active });
      } else {
        await api.post("/drivers", { name, email: email.trim(), password, phone, vehicle });
      }
      router.back();
    } catch (e: any) {
      setError(e.message || "Erro ao salvar");
    } finally {
      setLoading(false);
    }
  }

  async function onDelete() {
    setLoading(true);
    try {
      await api.del(`/drivers/${id}`);
      router.back();
    } catch (e: any) {
      setError(e.message);
      setLoading(false);
    }
  }

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => router.back()} testID="motoboy-form-close">
          <Ionicons name="close" size={26} color={colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>{editing ? "Editar motoboy" : "Novo motoboy"}</Text>
        <View style={{ width: 26 }} />
      </View>

      <KeyboardAwareScrollView
        contentContainerStyle={styles.scroll}
        bottomOffset={90}
        keyboardShouldPersistTaps="handled"
      >
        <Field label="Nome" icon="person-outline" placeholder="Nome do motoboy" value={name} onChangeText={setName} testID="motoboy-name-input" />
        <Field
          label="E-mail (login)"
          icon="mail-outline"
          placeholder="motoboy@email.com"
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
          editable={!editing}
          testID="motoboy-email-input"
        />
        {!editing && (
          <Field
            label="Senha"
            icon="lock-closed-outline"
            placeholder="Senha de acesso"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
            testID="motoboy-password-input"
          />
        )}
        <Field label="Telefone" icon="call-outline" placeholder="(11) 99999-9999" keyboardType="phone-pad" value={phone} onChangeText={setPhone} testID="motoboy-phone-input" />
        <Field label="Veículo" icon="bicycle-outline" placeholder="Moto Honda CG 160" value={vehicle} onChangeText={setVehicle} testID="motoboy-vehicle-input" />

        {editing && (
          <Pressable style={styles.toggle} onPress={() => setActive((a) => !a)} testID="motoboy-active-toggle">
            <Text style={styles.toggleLabel}>Motoboy ativo</Text>
            <View style={[styles.switch, active && styles.switchOn]}>
              <View style={[styles.knob, active && styles.knobOn]} />
            </View>
          </Pressable>
        )}

        {error ? <Text style={styles.error} testID="motoboy-form-error">{error}</Text> : null}

        <Button title={editing ? "Salvar alterações" : "Cadastrar motoboy"} onPress={onSave} loading={loading} testID="motoboy-save-button" />

        {editing && (
          <Button title="Remover motoboy" variant="ghost" onPress={onDelete} style={{ marginTop: spacing.md }} testID="motoboy-delete-button" />
        )}
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
  error: { color: colors.problema, fontSize: font.small, marginBottom: spacing.md, textAlign: "center" },
  toggle: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.md,
    marginBottom: spacing.lg,
  },
  toggleLabel: { color: colors.text, fontSize: font.body, fontWeight: "600" },
  switch: { width: 48, height: 28, borderRadius: 14, backgroundColor: colors.surface3, padding: 3 },
  switchOn: { backgroundColor: colors.primary },
  knob: { width: 22, height: 22, borderRadius: 11, backgroundColor: colors.white },
  knobOn: { alignSelf: "flex-end" },
});
