// Categoria do anúncio em si (o que está sendo anunciado), não o tipo do imóvel dentro
// dessa categoria (isso é `tipoImovel`, vocabulário livre por fonte). Hoje só existe
// um valor porque a spider só raspa anúncios de imóvel — a coluna existe para o dia em
// que outra categoria de anúncio (ex.: veículo) entrar na mesma tabela.
export enum TipoAnuncio {
  IMOVEL = 'imovel',
}
