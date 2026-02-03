/**
 * Компонент для вставки JSON-LD structured data
 */

interface JsonLdProps {
  data: Record<string, unknown> | Record<string, unknown>[]
}

export function JsonLd({ data }: JsonLdProps) {
  const jsonLdString = JSON.stringify(data)

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: jsonLdString }}
    />
  )
}

/**
 * Компонент для множественных JSON-LD схем
 */
interface MultiJsonLdProps {
  schemas: Record<string, unknown>[]
}

export function MultiJsonLd({ schemas }: MultiJsonLdProps) {
  return (
    <>
      {schemas.map((schema, index) => (
        <JsonLd key={index} data={schema} />
      ))}
    </>
  )
}
