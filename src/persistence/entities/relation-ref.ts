// Tipo puramente estrutural, sem uso em runtime — sempre importado com `import type`
// (apagado do JS emitido). Usado para anotar os dois lados de uma relação entre entidades
// com import circular entre si: sem isso, o `design:type` gerado por emitDecoratorMetadata
// referencia a classe do outro lado diretamente, e o ciclo de import estoura
// "Cannot access '<Classe>' before initialization" no ESM compilado (TDZ), já que os dois
// módulos dependem um do outro na carga. A relação em si (`@ManyToOne`/`@OneToMany`)
// continua resolvendo a classe normalmente, via thunk lazy (`() => Imovel`), que só é
// chamado depois que os dois módulos já terminaram de carregar.
export type RelationRef<T> = T;
