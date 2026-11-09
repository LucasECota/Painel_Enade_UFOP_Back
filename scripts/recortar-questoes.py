#!/usr/bin/env python3
"""Recorta cada questão dos cadernos de prova do Enade em uma imagem (WebP) para o painel.

Uso (a partir da pasta do back, com `pip install pymupdf pillow`):
    python scripts/recortar-questoes.py                 # todos os cadernos de scripts/cadernos.json
    python scripts/recortar-questoes.py --curso ec --ano 2023

Os PDFs ficam fora do repositório, na pasta "Projeto Enade/Questoes" (um nível acima das pastas do painel);
`--pasta` muda esse endereço. As imagens vão para data/questoes-imagens/<ano>/:
    fg-<n>.webp / fg-d<n>.webp        questões de Formação Geral (iguais para todos os cursos do ano)
    <curso>-<n>.webp / <curso>-d<n>.webp   questões do Componente Específico
Só a imagem do enunciado é gerada: o gabarito vem das tabelas do INEP (data/questoes/*.json).
"""
import argparse
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import recortar_questoes_lib as lib  # noqa: E402

LARGURA_MAXIMA = 900  # px: o suficiente para ler o enunciado no site sem pesar
QUALIDADE = 68


def nome_do_arquivo(curso, rotulo, objetivas_fg):
    """Formação Geral: objetivas 1..objetivas_fg e as discursivas D1 (e D2); o resto é do curso."""
    eh_discursiva = rotulo.startswith("D")
    numero = int(rotulo.lstrip("D"))
    fg = (not eh_discursiva and numero <= objetivas_fg) or (eh_discursiva and numero <= (1 if objetivas_fg == 9 else 2))
    prefixo = "fg" if fg else curso
    return f"{prefixo}-{rotulo.lower()}.webp"


def principal():
    ap = argparse.ArgumentParser()
    ap.add_argument("--curso")
    ap.add_argument("--ano", type=int)
    ap.add_argument("--pasta", default=os.path.join(os.path.dirname(__file__), "..", "..", "Projeto Enade", "Questoes"))
    args = ap.parse_args()

    raiz = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
    cadernos = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "cadernos.json"), encoding="utf-8"))
    for c in cadernos:
        if (args.curso and c["curso"] != args.curso) or (args.ano and c["ano"] != args.ano):
            continue
        doc, questoes = lib.recortar(os.path.join(args.pasta, c["pdf"]), ultimo=str(c["ultimaObjetiva"]))
        destino = os.path.join(raiz, "data", "questoes-imagens", str(c["ano"]))
        os.makedirs(destino, exist_ok=True)
        esperadas = [str(n) for n in range(1, c["ultimaObjetiva"] + 1)]
        faltam = [n for n in esperadas if n not in questoes]
        cortadas = []
        for rotulo, pedacos in questoes.items():
            img = lib.imagem(doc, pedacos)
            if img is None:
                faltam.append(rotulo)
                continue
            if img.width > LARGURA_MAXIMA:
                img = img.resize((LARGURA_MAXIMA, round(img.height * LARGURA_MAXIMA / img.width)))
            if lib.tocou_na_borda:
                cortadas.append(rotulo)
            nome = nome_do_arquivo(c["curso"], rotulo, c["objetivasFg"])
            if nome.startswith("fg-") and os.path.exists(os.path.join(destino, nome)) and c["curso"] != "ec":
                continue  # a Formação Geral é a mesma em todos os cursos do ano: fica a do primeiro caderno
            img.save(os.path.join(destino, nome), "WEBP", quality=QUALIDADE, method=6)
        print(f"{c['curso']} {c['ano']}: {len(questoes)} questões" + (f" — FALTAM: {faltam}" if faltam else "") + (f" — talvez cortadas embaixo: {cortadas}" if cortadas else ""))


if __name__ == "__main__":
    principal()
