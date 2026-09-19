# Pacote de assets — Template TOTVS

Este diretório reúne todas as imagens externas usadas pelo catálogo HTML, sem duplicar arquivos idênticos. Ele está preparado para ser copiado para o repositório público `rafaellcarvalhototvs/assets-totvs` sob a pasta `totvs-template-reference-final/`.

## Situação atual

- O catálogo HTML original ainda usa caminhos locais (`../assets/...` e `thumbnails/...`).
- Este pacote ainda **não foi publicado** e, por isso, as URLs com `{ref}` ainda são modelos.
- Depois do envio, substitua `{ref}` pelo SHA do commit publicado. Para prévia, `main` também funciona, mas não é imutável.

## Estrutura

- `media/static/`: PNG e JPEG estáticos.
- `media/animated/`: GIFs animados originais.
- `media/posters/`: primeiro e último quadro usados pelo controle de animação.
- `thumbnails/`: miniaturas renderizadas dos 118 slides HTML.
- `data/assets-by-slide.json`: consulta por slide, sem duplicar arquivos.
- `data/charts/`: dados editáveis dos gráficos.
- `data/manifests/`: contexto de slides, animações, acessibilidade e editabilidade.
- `manifest.json`: inventário técnico completo, hashes, dimensões, papéis e uso por slide.
- `rewrite-map.json`: mapa dos caminhos locais atuais para as futuras URLs do GitHub.
- `checksums.sha256`: verificação de integridade.

## Publicação recomendada

Use Git pela linha de comando, e não o upload pelo navegador do GitHub: há GIFs acima de 25 MiB, embora nenhum arquivo ultrapasse o limite de 100 MiB do Git.

1. Copie esta pasta `totvs-template-reference-final` para a raiz do repositório.
2. Faça commit e push.
3. Confirme o SHA remoto.
4. Valide pelo menos uma URL `raw.githubusercontent.com` usando esse SHA.
5. Gere uma cópia do catálogo com as referências remotas usando `rewrite-map.json`.

Base RAW:

`https://raw.githubusercontent.com/rafaellcarvalhototvs/assets-totvs/{ref}/totvs-template-reference-final/`

Base CDN apoiada no GitHub:

`https://cdn.jsdelivr.net/gh/rafaellcarvalhototvs/assets-totvs@{ref}/totvs-template-reference-final/`

Para uso por um GEM/Gemini, prefira a URL RAW presa ao SHA do commit; isso evita mudanças silenciosas quando a branch `main` avançar.
