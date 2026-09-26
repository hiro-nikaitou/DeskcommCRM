/**
 * O PACOTE "Atender" CONTRA O TETO — em segundos, não em vinte minutos.
 *
 * Hoje só o e2e tests/e2e/capacidades-do-agente.spec.ts percebe quando uma capacidade
 * nova entra no pacote "Atender" e empurra a recusa de "faltam 1 vaga" para 2 — e ele
 * leva vinte minutos, porque antes do número sobe o app, aplica o seed e faz login com
 * MFA. Aqui é a MESMA conta, em milissegundos.
 *
 * Nada é literal: o teto sai de TETO_TOOLS_POR_AGENTE (a constante que a tela mostra e
 * que o Zod de lib/ai/agents/validation.ts aplica), o tamanho do pacote sai do catálogo
 * SERVIDO (juntarCatalogoComHandlers — o que a rota /api/v1/mcp/tools entrega à tela,
 * sem contar capacidade do harness, que não é oferecida) e as capacidades do seed são
 * LIDAS de TOOLS_DO_SEED na spec do e2e: uma lista copiada divergiria dela em silêncio.
 * A conta usa vagasExigidasPeloPacote, a mesma função que o servidor chama no clique.
 */
import * as fs from "node:fs";
import * as path from "node:path";

import { describe, expect, it } from "vitest";

import { allTools } from "@/lib/mcp/tools";
import { TOOL_CATALOG } from "@/lib/mcp/tools/catalog";
import { juntarCatalogoComHandlers } from "@/lib/mcp/tools/catalogo-servido";
import {
  TETO_TOOLS_POR_AGENTE,
  capacidadesAutomaticasDoPacote,
  vagasExigidasPeloPacote,
  type CapacidadeSelecionavel,
} from "@/lib/mcp/tools/selecao-por-pacote";

const PACOTE = "atender";
const SPEC_DO_E2E = path.join(process.cwd(), "tests", "e2e", "capacidades-do-agente.spec.ts");

/** O catálogo como a tela o recebe — a mesma junção que a rota serve. */
const SERVIDO = juntarCatalogoComHandlers(allTools, TOOL_CATALOG);

/** O shape que a regra de pacote lê (a tela passa este mesmo). */
const SELECIONAVEL: ReadonlyArray<CapacidadeSelecionavel> = SERVIDO.map((c) => ({
  name: c.id,
  risco: c.risco,
  pacotes: c.pacotes,
  marcavel: c.marcavel,
}));

/**
 * As capacidades que o seed do e2e liga, tiradas de TOOLS_DO_SEED na spec. O fim do
 * array é ancorado em início de linha porque os comentários de dentro dele citam
 * TOOLS_DO_SEED[2]; e os comentários saem ANTES da busca pelas aspas, que também
 * pegariam nome de pacote ("Atender").
 */
function seedDaSpec(): string[] {
  const fonte = fs.readFileSync(SPEC_DO_E2E, "utf8");
  const bloco = /const TOOLS_DO_SEED = \[([\s\S]*?)\r?\n\];/.exec(fonte)?.[1];
  if (bloco === undefined) return [];
  return [...bloco.replace(/\/\/[^\n]*/g, "").matchAll(/"([a-z0-9_]+)"/g)].map((m) => m[1]!);
}

const SEED = seedDaSpec();
const DO_PACOTE = capacidadesAutomaticasDoPacote(SELECIONAVEL, PACOTE);

const vagasPartindoDe = (selecionadas: ReadonlyArray<string>) =>
  vagasExigidasPeloPacote(selecionadas, SELECIONAVEL, PACOTE);

describe(`o pacote "${PACOTE}" contra o teto, no cenário do seed do e2e`, () => {
  it("o seed foi lido da spec, existe no catálogo e fica FORA do pacote", () => {
    expect(SEED.length, `não li nenhuma capacidade em ${SPEC_DO_E2E}`).toBeGreaterThan(0);
    const sumiram = SEED.filter((nome) => !SERVIDO.some((c) => c.id === nome));
    expect(sumiram, "o seed cita capacidade que o catálogo não serve").toEqual([]);
    // A spec exige isso por escrito ("as escolhidas ficam FORA do pacote de propósito"):
    // com uma capacidade nas duas pontas a conta vira união e o e2e mede outro número.
    const dentro = SEED.filter((nome) =>
      SERVIDO.find((c) => c.id === nome)?.pacotes.includes(PACOTE),
    );
    expect(dentro, `capacidade do seed também dentro de "${PACOTE}"`).toEqual([]);
  });

  it(`ligar "${PACOTE}" a partir do seed pede UMA vaga a mais que o teto`, () => {
    const pedidas = vagasPartindoDe(SEED);
    expect(
      pedidas,
      `${PACOTE}: ${DO_PACOTE.length} do pacote + ${SEED.length} do seed = ${pedidas} contra o teto ` +
        `de ${TETO_TOOLS_POR_AGENTE}. A recusa tem de ser por uma vaga ("faltam 1 vaga"): se o ` +
        `pacote cresceu, ela passa a pedir ${pedidas - TETO_TOOLS_POR_AGENTE} e a spec do e2e só ` +
        `acusa vinte minutos depois do push; se encolheu, o pacote passa a caber e o caso de ` +
        `recusa vira um clique que sempre dá certo — verde sem medir nada.`,
    ).toBe(TETO_TOOLS_POR_AGENTE + 1);
  });
  it("desligar QUALQUER capacidade do seed abre a vaga que faz o pacote caber no teto", () => {
    expect(SEED.length, "controle: sem seed não há vaga a abrir").toBeGreaterThan(0);
    const cabe = (fora: string) =>
      vagasPartindoDe(SEED.filter((nome) => nome !== fora)) === TETO_TOOLS_POR_AGENTE;
    expect(SEED.filter(cabe), `o pacote não caberia no teto de ${TETO_TOOLS_POR_AGENTE}`).toEqual(
      SEED,
    );
  });
});
