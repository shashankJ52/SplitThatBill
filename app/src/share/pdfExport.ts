import { drawDocument } from './drawExport'
import type { ExportModel } from './exportModel'
import { buildPdf, pageFit, paginate, type PageImage, type Paper } from './pdf'

const fromDataUrl = (url: string): Uint8Array => {
  const bin = atob(url.slice(url.indexOf(',') + 1))
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

/**
 * The bill as a PDF: the station sign summary first, then every item, on as few pages as it takes. It does not depend on
 * which picture look is chosen. Drawn at twice the size for sharp print, on the device.
 */
export function exportPdf(m: ExportModel, showLink: boolean, paper: Paper): Blob {
  const { canvas: big, breaks } = drawDocument(m, showLink, 2)
  const { pxPerPage } = pageFit(big.width, paper)
  const pages: PageImage[] = paginate(big.height, breaks, pxPerPage).map(([top, h]) => {
    const c = document.createElement('canvas')
    c.width = big.width
    c.height = h
    c.getContext('2d')?.drawImage(big, 0, top, big.width, h, 0, 0, big.width, h)
    return { jpeg: fromDataUrl(c.toDataURL('image/jpeg', 0.92)), w: c.width, h }
  })
  const bytes = buildPdf(pages, paper, { title: `${m.title} - split` })
  return new Blob([bytes as BlobPart], { type: 'application/pdf' })
}
