# Arquitetura

Coleções: `users`, `stores`, `categories`, `products`, `orders`.

Fluxo: cliente abre `#/menu/slug`, monta carrinho, envia pedido, loja gerencia status, entregador abre GPS e dá baixa.

WhatsApp real automático exige Cloud Functions ou backend, porque token da Cloud API não pode ficar no navegador.

