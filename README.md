# ForgeCMS + MenuForge

ForgeCMS é um CMS estático/Firebase inspirado no fluxo administrativo do WordPress, mas refeito para GitHub Pages + Firebase.

## Login inicial

Abra:

```text
admin.html?v=admin
```

Credenciais iniciais:

```text
usuário: admin
senha: admin123
```

Depois troque em:

```text
Configurações → Segurança
```

## Módulos

- ForgeCMS Core
- MenuForge Delivery
- Aprovação de contas
- Backup JSON
- Theme Studio
- SEO básico

## Firebase

Ative:

- Authentication → Email/Password
- Authentication → Google, se quiser
- Firestore Database
- Authorized domains: `davicostadua480-oss.github.io`

Publique regras:

```bash
firebase deploy --only firestore:rules
```

