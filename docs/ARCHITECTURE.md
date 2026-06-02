# Arquitetura ForgeCMS

## Coleções principais

```text
users
cms_options
cms_content
cms_media
cms_taxonomies
cms_comments
cms_plugins
cms_themes
stores
categories
products
orders
```

## Equivalência com WordPress

```text
wp_options      → cms_options
wp_posts        → cms_content
wp_postmeta     → campos meta dentro de content
wp_terms        → cms_taxonomies
wp_users        → users
wp_comments     → cms_comments
plugins         → cms_plugins
themes          → cms_themes
```

## Rotas

```text
admin.html?v=admin#/dashboard
admin.html?v=admin#/content/post
admin.html?v=admin#/media
admin.html?v=admin#/appearance
admin.html?v=admin#/plugins
admin.html?v=admin#/users
admin.html?v=admin#/settings
admin.html?v=admin#/menuforge/orders
```

