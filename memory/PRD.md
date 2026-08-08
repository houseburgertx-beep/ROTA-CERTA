# PRD — Rota Certa (App de Gestão de Entregas)

## Problema original
App mobile nativo (Expo/React Native + FastAPI + MongoDB) para gestão de entregas, rotas e motoboys, com leitura de comanda por IA, rastreamento em tempo real e roteirização automática. Dois perfis: Gestor/Admin e Motoboy. Correção do protótipo (responsividade, cadastro de motoboy, layout).

## Escolhas do usuário
- IA de visão: **Groq** (grátis, chave própria) — modelo `qwen/qwen3.6-27b` (vision).
- Auth: **JWT** email/senha (Gestor cria contas de Motoboy).
- Mapa: **OpenStreetMap + Leaflet** via WebView (100% grátis, sem API key).
- Dados: iniciar **vazio** (sem seed).
- Visual: tema escuro "command-center" + laranja de sinalização.

## Arquitetura
- Backend: FastAPI (`/app/backend/server.py`), MongoDB (motor). JWT (pyjwt), bcrypt (passlib). Geocoding grátis via Nominatim/OSM. Roteirização nearest-neighbor + haversine. Groq vision via httpx (OpenAI-compatible).
- Frontend: Expo Router com grupos por papel `(admin)` e `(driver)`. AuthContext + storage seguro. Leaflet WebView. expo-image-picker (scan) e expo-location (GPS). react-native-keyboard-controller.

## Personas
- Gestor/Admin: monta rotas, cadastra motoboys, lê comandas, acompanha mapa e faturamento.
- Motoboy: recebe entregas ordenadas, atualiza status, compartilha GPS, navega.

## Implementado (2026-06)
- Auth JWT (registro de gestor, login, /me) com papéis.
- Dashboard do gestor: aguardando/em rota/concluídas hoje/com problema.
- CRUD de motoboys (resolve o bug "não cadastra motoboy").
- Leitura de comanda por IA (Groq qwen3.6-27b) → tela de revisão/edição com alerta de endereço incompleto.
- Criação de entregas com geocoding automático.
- Roteirização automática (ordem por proximidade, km e tempo estimado, atribuição ao motoboy).
- Mapa ao vivo (Leaflet) com motoboys e entregas; polling 8s.
- App do motoboy: lista ordenada, avançar status, reportar problema, navegar, compartilhar GPS.
- Faturamento: taxa realizada/em aberto/prevista, valor dos pedidos separado, métricas.
- Notificações no app (nova entrega, status, problema, rota).
- Segurança: checagem de ownership por admin_id em entregas/motoboys/rotas.

## Backlog / próximos
- P1: Notificações via WhatsApp (Twilio).
- P1: Relatórios/histórico de faturamento por período.
- P2: Avaliação de entregas pelo cliente.
- P2: Pagamento online (Pix/Stripe).
- P2: Definir "ponto de partida" (loja) para roteirização mais precisa.

## Credenciais de teste
Ver `/app/memory/test_credentials.md`.
