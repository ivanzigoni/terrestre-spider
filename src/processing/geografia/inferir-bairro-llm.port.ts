export interface InferenciaBairroLlm {
  bairro: string | null;
  confianca: number;
}

export interface InferidorBairroLlm {
  inferir: (valorBruto: string) => Promise<InferenciaBairroLlm>;
}
