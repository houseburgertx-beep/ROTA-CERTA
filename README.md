# Rota Certa

**Entregas organizadas. Menos caminho. Mais agilidade.**

Aplicação operacional para cadastrar entregas, ler comandas no aparelho, localizar endereços, montar rotas e acompanhar o trabalho dos motoboys. A interface está em português do Brasil, é responsiva e inclui dados demonstrativos de Salvador.

## Funcionalidades

- Dashboard com indicadores, mapa, próximos prazos e estado da operação.
- Controle separado da taxa de entrega, total realizado, valores em aberto e ganho por motoboy.
- Entregas com busca, filtros, prioridades, status e ações.
- Cadastro manual com validação e localização do endereço.
- Leitura local de comandas com Tesseract.js; a imagem não é enviada nem armazenada.
- Planejamento gratuito por OSRM e Valhalla, com fallback local por vizinho mais próximo.
- Mapas OpenStreetMap, CARTO e OpenTopoMap selecionáveis sem chave.
- Geocodificação por Nominatim e Photon e localização atual pelo GPS do aparelho.
- Equipe de motoboys, rota móvel, configurações e status de integrações.
- Modo demonstração quando o Firebase não está configurado.
- Regras Firestore multiestabelecimento em `firestore.rules`.

## Tecnologias

React, TypeScript, Vite/Vinext, Tailwind CSS, Firebase Authentication, Cloud Firestore, Leaflet/OpenStreetMap, Tesseract.js, Nominatim, OpenRouteService, Lucide React, React Hook Form, Zod e date-fns.

## Instalação local

Requer Node.js 22 ou superior.

```bash
npm install
cp .env.example .env
npm run dev
```

Sem variáveis configuradas, a aplicação abre automaticamente em modo demonstração.

## Firebase

1. Crie um projeto gratuito no Firebase Console (plano Spark).
2. Em **Authentication > Sign-in method**, ative e-mail e senha.
3. Crie o Cloud Firestore em modo de produção e escolha uma região próxima.
4. Registre um aplicativo Web e copie os valores públicos para `.env`.
5. Publique as regras com `firebase deploy --only firestore:rules`.
6. Cadastre o domínio publicado em **Authentication > Settings > Authorized domains**.

O cadastro inicial deve criar o usuário no Authentication, o documento da empresa e o perfil `admin`. As regras impedem leitura entre empresas e limitam o motoboy aos campos operacionais das entregas atribuídas.

## Mapas, localização e roteirização gratuitas

O funcionamento básico não exige chave nem cartão. A aplicação usa OpenStreetMap, CARTO ou OpenTopoMap para exibição; Nominatim e Photon para busca de endereços; OSRM e Valhalla para cálculo viário; e o GPS do navegador para a localização atual. Se todos os serviços de rota estiverem indisponíveis, o sistema preserva a sequência por vizinho mais próximo e calcula uma estimativa local.

Os endpoints públicos são adequados a uso leve e demonstração. O Nominatim é limitado no cliente para respeitar o intervalo mínimo entre pesquisas. Em operação comercial de alto volume, hospede instâncias próprias ou contrate capacidade dedicada e cumpra as políticas de cada provedor.

OpenRouteService, GraphHopper, Geoapify e LocationIQ permanecem como opções de plano gratuito por chave. Essas chaves são opcionais; sem elas, o sistema continua funcionando com os provedores sem chave.

## Variáveis

Consulte `.env.example`. Nunca publique `.env` e nunca inclua chaves reais no código. Variáveis `VITE_` ficam acessíveis no navegador. Esta arquitetura é adequada a MVP e testes; em produção, proteja chaves e aplique limites em um backend.

## Deploy no GitHub Pages

Configure o `base` do Vite com o nome do repositório, envie o projeto à branch `main`, ative **Settings > Pages > GitHub Actions** e cadastre as variáveis necessárias como secrets do repositório. Em SPA estática, use `HashRouter` ou copie `index.html` para `404.html` no workflow para preservar rotas. O build publicado deve vir de `npm run build`.

## Privacidade e limites

A foto da comanda é processada localmente e descartada ao sair da tela. Somente os campos revisados e confirmados são persistidos. Mapas, geocodificação e rotas dependem de internet. O cache não deve reter respostas indefinidamente. Não há rastreamento contínuo em segundo plano nesta versão.

## Problemas comuns

- **Modo demonstração permanece ativo:** confira nomes e valores do `.env` e reinicie o servidor.
- **Endereço não localizado:** acrescente número, bairro, cidade e estado; ajuste o marcador manualmente.
- **Rota usa fallback local:** confira a internet; OSRM e Valhalla são tentados automaticamente.
- **Firebase permission-denied:** confirme `companyId`, `role` e publicação das regras.
- **Página em branco no GitHub Pages:** corrija `base` e o fallback de SPA.
- **OCR fraco:** fotografe sem sombra, paralelamente ao papel e com boa iluminação.

## Próximas melhorias

Backend para proteger chaves, auditoria completa, importação em lote, notificações, rastreamento com consentimento, comprovante de entrega, relatórios e suporte offline mais amplo.
