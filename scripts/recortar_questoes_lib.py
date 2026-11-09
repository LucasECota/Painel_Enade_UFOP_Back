#!/usr/bin/env python3
"""Recorta cada questão de um caderno de prova do Enade em uma imagem.

Uso: recortar.py caderno.pdf saida_dir prefixo_ce  [--so-listar]
O caderno tem páginas de uma ou duas colunas. Cada questão começa num título "QUESTÃO NN" (ou "QUESTÃO
DISCURSIVA NN") e termina em "ÁREA LIVRE" / "RASCUNHO" ou no título da seguinte; se a questão passa para a
coluna ou a página seguinte, os pedaços são empilhados na mesma imagem.
"""
import io
import json
import re
import sys

import pymupdf as fitz
from PIL import Image

ESCALA = 3.0  # 216 dpi: o texto fica legível numa imagem de ~800 px de largura


def colunas(pagina):
    """Devolve as colunas da página como (x0, x1): duas se há texto só na metade esquerda e só na direita."""
    L, A = pagina.rect.width, pagina.rect.height
    esq = dir_ = 0
    for b in pagina.get_text("blocks"):
        if b[1] < 0.07 * A or b[3] > 0.94 * A or not b[4].strip():
            continue
        if b[2] - b[0] > 0.6 * L:  # um parágrafo largo: a página é de uma coluna só
            return [(L * 0.03, L * 0.97)]
        if b[2] <= 0.5 * L + 12:
            esq += 1
        elif b[0] >= 0.5 * L - 12:
            dir_ += 1
    if esq and dir_:
        return [(L * 0.03, L * 0.5 - 3), (L * 0.5 + 3, L * 0.97)]
    return [(L * 0.03, L * 0.97)]


DIGITOS = {"Ϭ": "0", "ϭ": "1", "Ϯ": "2", "ϯ": "3", "ϰ": "4", "ϱ": "5", "ϲ": "6", "ϳ": "7", "ϴ": "8", "ϵ": "9"}


def linhas(pagina):
    """Linhas de texto da página: (retângulo da primeira palavra, texto da linha)."""
    grupos = {}
    for x0, y0, x1, y1, texto, bloco, linha, _ in pagina.get_text("words"):
        g = grupos.setdefault((bloco, linha), [])
        g.append((x0, y0, x1, y1, texto))
    saida = []
    for g in grupos.values():
        g.sort(key=lambda w: w[0])
        saida.append((fitz.Rect(g[0][:4]), " ".join(w[4] for w in g)))
    return saida


def rotulos(pagina):
    """Títulos de questão da página: lista de (rect, rótulo), onde rótulo é '9' ou 'D3'.
    Entende o título normal ("QUESTÃO 09") e o embaralhado de algumas fontes ("Yh^dKϬϱ")."""
    achados = []
    for r, texto in linhas(pagina):
        m = re.match(r"QUEST[ÃA]O\s*(DISCURSIVA)?\s*[-–]?\s*(\d+)", texto, re.I)
        if m:
            achados.append((r, ("D" if m.group(1) else "") + str(int(m.group(2)))))
            continue
        m = re.match(r"Yh\s*\^d\s*K\s*(/\s*\^\s*h\s*Z\s*\^\s*/\s*s)?\s*([ϬϭϮϯϰϱϲϳϴϵ0-9 ]+)", texto)
        if m:
            digitos = "".join(DIGITOS.get(c, c) for c in m.group(2) if c != " ")
            if digitos.isdigit():
                achados.append((r, ("D" if m.group(1) else "") + str(int(digitos))))
    return achados


def fins(pagina):
    """Marcas que encerram uma questão: 'ÁREA LIVRE' e 'RASCUNHO' (também na versão embaralhada)."""
    marcas = []
    for r, texto in linhas(pagina):
        t = texto.strip().upper()
        if t.startswith("ÁREA LIVRE") or t.startswith("AREA LIVRE") or t.startswith("RASCUNHO") or texto.strip().startswith("ƌĞĂůŝǀƌĞ"):
            marcas.append(r)
    return marcas


def regioes(doc):
    """Regiões de leitura (página, coluna) em ordem, com títulos e marcas de fim já posicionados."""
    for numero, pagina in enumerate(doc):
        A = pagina.rect.height
        # o cabeçalho da prova (logo e código de barras) é feito de desenhos e imagens no alto da página
        cabecalho = [d["rect"].y1 for d in pagina.get_drawings() if d["rect"].y1 < 0.095 * A and d["rect"].width < 0.9 * pagina.rect.width]
        cabecalho += [i["bbox"][3] for i in pagina.get_image_info() if i["bbox"][3] < 0.095 * A]
        topo = (max(cabecalho) + 3) if cabecalho else 0.05 * A
        # o rodapé começa numa linha horizontal comprida; sem ela, vale uma estimativa
        L = pagina.rect.width
        rodape = [d["rect"].y0 for d in pagina.get_drawings() if d["rect"].height < 2 and d["rect"].width > 0.5 * L and d["rect"].y0 > 0.88 * A]
        base = (min(rodape) - 2) if rodape else 0.935 * A
        for r, texto in linhas(pagina):
            if texto.upper().startswith("EXAME NACIONAL") and r.y0 > 0.85 * A:
                base = min(base, r.y0 - 2)
        titulos = rotulos(pagina)
        marcas = fins(pagina)
        for (x0, x1) in colunas(pagina):
            ev = []
            for r, rot in titulos:
                if x0 - 6 <= r.x0 <= x1:
                    ev.append((r.y0, "titulo", rot))
            for r in marcas:
                if x0 - 6 <= r.x0 <= x1 and r.y0 > topo:
                    ev.append((r.y0, "fim", None))
            ev.sort(key=lambda e: e[0])
            yield numero, (x0, x1), topo, base, ev


def uniao_de_colunas(questoes):
    """Questão que ocupa as duas colunas da mesma página (texto à esquerda, figura à direita): em vez de
    empilhar as colunas, junta o pedaço numa faixa só, como está na prova."""
    for rot, pedacos in questoes.items():
        novos, i = [], 0
        while i < len(pedacos):
            a = pedacos[i]
            if i + 1 < len(pedacos):
                b = pedacos[i + 1]
                lado_a_lado = a[0] == b[0] and a[2] < b[1] + 8 and a[3] <= b[3] and abs(a[3] - b[3]) < 8
                if lado_a_lado:
                    novos.append(("lado", a, b))
                    i += 2
                    continue
            novos.append(a)
            i += 1
        questoes[rot] = novos
    return questoes


def recortar(caminho, ultimo=None):
    doc = fitz.open(caminho)
    questoes = {}  # rótulo -> lista de (página, x0, x1, y0, y1)
    atual = None
    vistos = set()
    parar = False
    for numero, (x0, x1), topo, base, ev in regioes(doc):
        if parar:
            break
        y = topo
        for (ypos, tipo, rot) in ev:
            if tipo == "titulo":
                if atual is not None and ypos - y > 14:  # o que sobrou antes do título pertence à questão aberta
                    questoes[atual].append((numero, x0, x1, y, ypos - 3))
                # o caderno repete os rótulos no questionário do estudante: o primeiro que repete encerra
                if rot in vistos and not rot.startswith("D"):
                    parar = True
                    atual = None
                    break
                vistos.add(rot)
                atual = rot
                questoes[atual] = []
                y = ypos - 5
            else:  # fim
                if atual is not None:
                    questoes[atual].append((numero, x0, x1, y, ypos - 3))
                    atual = None
                y = base
        if parar:
            break
        if atual is not None and base - y > 14:
            questoes[atual].append((numero, x0, x1, y, base))
        if atual is not None and atual == ultimo:  # a última questão da prova não continua nas páginas seguintes
            atual = None
            if x1 > 0.9 * doc[numero].rect.width:
                break
    return doc, uniao_de_colunas(questoes)


def aparar(im, margem=10):
    """Tira o branco que sobra ao redor (principalmente à direita, quando a coluna é mais larga que o texto)."""
    cinza = im.convert("L").point(lambda v: 255 if v < 245 else 0)
    caixa = cinza.getbbox()
    if not caixa:
        return im
    x0, y0, x1, y1 = caixa
    return im.crop((max(0, x0 - margem), max(0, y0 - margem), min(im.width, x1 + margem), min(im.height, y1 + margem)))


tocou_na_borda = False  # a última imagem gerada tem alguma palavra cortada na borda de cima ou de baixo


def imagem(doc, pedacos):
    """Empilha os pedaços de uma questão numa única imagem."""
    global tocou_na_borda
    tocou_na_borda = False
    partes = []
    for pedaco in pedacos:
        if pedaco[0] == "lado":  # duas colunas lado a lado: a faixa inteira
            _, a, b = pedaco
            pedaco = (a[0], a[1], b[2], min(a[3], b[3]), max(a[4], b[4]))
        (pag, x0, x1, y0, y1) = pedaco
        if y1 - y0 < 6:
            continue
        clip = fitz.Rect(x0, y0, x1, y1)
        pix = doc[pag].get_pixmap(matrix=fitz.Matrix(ESCALA, ESCALA), clip=clip, alpha=False)
        bruta = Image.open(io.BytesIO(pix.tobytes("png"))).convert("RGB")
        for w in doc[pag].get_text("words"):
            r = fitz.Rect(w[:4])
            if r.intersects(clip) and (r.y0 < clip.y0 - 1.5 < r.y1 or r.y0 < clip.y1 + 1.5 < r.y1) and w[4].strip():
                tocou_na_borda = True  # uma palavra atravessa a borda: texto cortado
        partes.append(aparar(bruta))
    if not partes:
        return None
    largura = max(p.width for p in partes)
    altura = sum(p.height for p in partes) + 8 * (len(partes) - 1)
    out = Image.new("RGB", (largura, altura), "white")
    y = 0
    for p in partes:
        out.paste(p, (0, y))
        y += p.height + 8
    return out


if __name__ == "__main__":
    doc, questoes = recortar(sys.argv[1], ultimo=sys.argv[3] if len(sys.argv) > 3 and not sys.argv[3].startswith('--') else None)
    print(len(doc), "páginas;", len(questoes), "questões:", list(questoes))
    if "--so-listar" not in sys.argv:
        import os
        os.makedirs(sys.argv[2], exist_ok=True)
        for rot, pedacos in questoes.items():
            im = imagem(doc, pedacos)
            if im is not None:
                im.save(os.path.join(sys.argv[2], f"{rot}.png"))
