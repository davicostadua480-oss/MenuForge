# MenuForge

Cardápio digital com Firebase Auth, Google login, Firestore, painel do estabelecimento, pedidos, entregador com GPS e baixa de recebimento, WhatsApp por link e Developer Studio básico.

## Ativar no Firebase

- Authentication: Email/Password e Google.
- Firestore Database.
- Authorized domains: adicione seu domínio GitHub Pages.
- Publique `firestore.rules`.

## Rodar

```bash
npx serve .
```

## Publicar

```bash
firebase deploy
```

## Primeiro uso

Crie uma conta como estabelecimento e clique em `Gerar demo`.

## Developer

No Firestore, defina `users/{uid}.role = "developer"`.

## WordPress

Este projeto não copia o WordPress completo: é uma base própria em Firebase. Se você quiser uma versão WordPress, o caminho correto é criar um plugin/tema GPL separado em PHP/MySQL.

