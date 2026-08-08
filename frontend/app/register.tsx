import React, { useState } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useAuth } from "@/src/context/AuthContext";
import { Button, Field } from "@/src/components/ui";
import { colors, spacing, font } from "@/src/theme/theme";

export default function Register() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { register } = useAuth();
  const [name, setName] = useState("");
  const [business, setBusiness] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit() {
    setError("");
    if (!name || !email || !password) {
      setError("Preencha nome, e-mail e senha");
      return;
    }
    setLoading(true);
    try {
      await register(name.trim(), email.trim(), password, business.trim());
      router.replace("/");
    } catch (e: any) {
      setError(e.message || "Não foi possível criar a conta");
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => router.back()} style={styles.back} testID="register-back">
          <Ionicons name="chevron-back" size={26} color={colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Criar conta</Text>
        <View style={{ width: 26 }} />
      </View>

      <KeyboardAwareScrollView
        contentContainerStyle={styles.scroll}
        bottomOffset={24}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.intro}>
          Conta de gestor para a sua operação. Os motoboys são cadastrados por você dentro do app.
        </Text>

        <Field
          label="Seu nome"
          icon="person-outline"
          placeholder="João Silva"
          value={name}
          onChangeText={setName}
          testID="register-name-input"
        />
        <Field
          label="Nome do negócio (opcional)"
          icon="storefront-outline"
          placeholder="Hamburgueria do João"
          value={business}
          onChangeText={setBusiness}
          testID="register-business-input"
        />
        <Field
          label="E-mail"
          icon="mail-outline"
          placeholder="voce@empresa.com"
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
          testID="register-email-input"
        />
        <Field
          label="Senha"
          icon="lock-closed-outline"
          placeholder="Mínimo 4 caracteres"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
          testID="register-password-input"
        />

        {error ? (
          <Text style={styles.error} testID="register-error">
            {error}
          </Text>
        ) : null}

        <Button
          title="Criar conta"
          onPress={onSubmit}
          loading={loading}
          testID="register-submit-button"
        />
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
  back: { width: 26 },
  headerTitle: { color: colors.text, fontSize: font.title, fontWeight: "800" },
  scroll: { paddingHorizontal: spacing.xl, paddingTop: spacing.lg, paddingBottom: 40 },
  intro: { color: colors.textMuted, fontSize: font.body, lineHeight: 21, marginBottom: spacing.xl },
  error: { color: colors.problema, fontSize: font.small, marginBottom: spacing.md, textAlign: "center" },
});
