# Hoja de Ruta de Producto para `nexfetch-rest`

## Proposito

Esta hoja de ruta parte del estado actual real de la libreria y busca convertirla de una herramienta prometedora en un paquete publico creible.

La meta no es competir de inmediato con todas las librerias grandes del ecosistema. La meta es afinar su propuesta de valor:

`nexfetch-rest` debe convertirse en un cliente REST liviano, tipado, con cache e invalidacion de mutaciones para equipos que quieren mas que `fetch` o `axios`, pero menos complejidad que TanStack Query + codegen + flujos pesados basados en OpenAPI.

## Punto de Partida Actual

Lo que ya existe:

- Definicion tipada de endpoints
- Llamadas directas a endpoints
- Hooks para React
- Adaptador vanilla
- Cache con manejo de stale y garbage collection
- Deduplicacion de requests GET
- Soporte de retry
- Invalidacion despues de mutaciones
- Parsing opcional de respuesta mediante validadores compatibles con `.parse()`

Lo que aun esta debil o incompleto:

- La validacion runtime esta incompleta para `body`, `query` y `params`
- El adaptador de Vue es solo un placeholder
- El README promete mas de lo que la implementacion entrega hoy
- Los hooks y las llamadas directas no dejan claro que compartan un unico runtime core
- No hay una suite de tests automatizados visible
- No existe sistema de middleware o interceptors
- No hay soporte de cancelacion
- No hay una historia clara para SSR
- Todavia no hay un posicionamiento publico fuerte

## Posicionamiento de Producto

### Audiencia principal

- Equipos TypeScript que construyen frontends REST
- Proyectos pequenos y medianos
- Equipos que quieren una capa API tipada sin generacion OpenAPI
- Equipos que sienten TanStack Query demasiado pesado para su caso

### No objetivos por ahora

- Paridad completa con TanStack Query
- Flujo totalmente OpenAPI-first
- Plataforma de contratos backend
- Soporte GraphQL
- Ecosistema empresarial de plugins

## Estrategia de Producto

La hoja de ruta esta organizada en 4 etapas:

1. Estabilizar la base
2. Volverla confiable para uso publico
3. Agregar diferenciadores elegidos con cuidado
4. Validar adopcion antes de expandirse mas

---

## Etapa 1: Estabilizar la Base

### Objetivo

Hacer que la libreria actual sea consistente, predecible y honesta respecto a lo que soporta.

### Prioridad

Critica

### Entregables

#### 1. Alinear documentacion con la realidad

- Actualizar los ejemplos del README para que coincidan con la forma real de la API
- Quitar o relabelar afirmaciones no soportadas como soporte completo de Vue o Solid
- Aclarar exactamente que valida hoy el sistema de schemas
- Agregar una pequena comparativa: cuando usar esta libreria vs `fetch`, `ky` o TanStack Query

#### 2. Unificar la arquitectura runtime

- Refactorizar la creacion del cliente para que hooks y llamadas directas usen el mismo `Fetcher` y el mismo `QueryCache`
- Asegurar que invalidacion, deduplicacion y estado de cache se comporten igual entre React y vanilla
- Eliminar caminos duplicados de construccion runtime cuando sea posible

#### 3. Completar la validacion runtime

- Validar `body` antes de enviar la request cuando exista schema
- Validar `query` antes de construir la URL cuando exista schema
- Validar `params` antes de interpolar el path cuando exista schema
- Mantener opcional la validacion de `response` como ya esta hoy

#### 4. Corregir ergonomia de API

- Definir una sola forma canonica de entrada:
  `api.users.list({ query: { page: 1 } })`
  y
  `mutation.mutate({ body: { ... } })`
- Hacer consistentes docs, tipos y ejemplos con esa forma
- Agregar errores runtime mas claros para path params faltantes o input invalido

#### 5. Establecer controles de calidad automatizados

- Agregar tests unitarios para:
  - generacion de query keys
  - deduplicacion
  - comportamiento stale y refetch
  - invalidacion
  - retries
  - validacion correcta e incorrecta de schemas
- Agregar CI para typecheck + tests

### Criterios de salida

- El README es preciso
- React y vanilla se comportan de forma consistente
- La validacion funciona en todas las partes soportadas de la request
- Las features core estan cubiertas por tests

### Release objetivo

`v0.3.x`

---

## Etapa 2: Confiabilidad para Uso Publico

### Objetivo

Hacer que el paquete sea lo suficientemente seguro como para ser adoptado por terceros.

### Prioridad

Alta

### Entregables

#### 1. Mejoras en el ciclo de vida de requests

- Agregar soporte para `AbortSignal`
- Soportar respuestas no JSON cuando tenga sentido:
  - respuestas vacias
  - texto
  - modo de respuesta cruda
- Mejorar el modelado de errores con una estructura `ApiError` mas clara

#### 2. Identidad estable de cache

- Reemplazar el uso ingenuo de `JSON.stringify` para keys por una serializacion estable
- Asegurar que inputs semanticamente iguales produzcan la misma query key
- Documentar exactamente como se derivan las keys de cache

#### 3. Limpieza del soporte de frameworks

- O bien:
  implementar Vue de verdad
- O bien:
  quitar la exportacion de Vue hasta que exista

Lo mismo aplica para cualquier futuro soporte de Solid:

- no documentarlo hasta que exista realmente

#### 4. Confianza en packaging y distribucion

- Agregar disciplina de changelog
- Agregar notas de compatibilidad para browser y Node
- Verificar tree-shaking y contenido publicado
- Agregar checklist de release

#### 5. Mejores ejemplos

- App de ejemplo en React
- App de ejemplo en vanilla
- Demo de mutacion + invalidacion
- Demo de headers de autenticacion

### Criterios de salida

- El comportamiento del paquete es predecible para usuarios externos
- La cancelacion de requests funciona
- La generacion de keys es estable
- Las afirmaciones sobre frameworks son verdaderas
- Los usuarios nuevos pueden evaluar la libreria solo con los ejemplos

### Release objetivo

`v0.4.x`

---

## Etapa 3: Features de Diferenciacion

### Objetivo

Agregar features que refuercen la identidad del producto sin volverlo pesado.

### Prioridad

Media

### Entregables

#### 1. Capa de middleware o interceptors

- Middleware de request
- Middleware de response
- Inyeccion de tokens de autenticacion
- Transformaciones centralizadas de respuesta

Esta mejora es de las mas importantes porque reduce una brecha grande frente a `axios` y `ky`.

#### 2. Control de cache mas inteligente

- `refetch` manual
- set/update manual del cache
- hooks opcionales para mutaciones optimistas
- helpers de invalidacion mas finos

Esto debe hacerse con cuidado para no convertir la libreria en una copia de TanStack Query.

#### 3. SSR y compatibilidad server

- Definir politica de soporte para SSR
- Asegurar que no se requieran globals del navegador durante ejecucion server
- Proveer guia basica de hydration o prefetch si es viable

#### 4. Mejor experiencia de desarrollo

- Documentacion mas fuerte sobre inferencia TypeScript
- Seccion de troubleshooting
- Recetas para:
  - paginacion
  - APIs autenticadas
  - requests dependientes
  - headers custom por endpoint

### Criterios de salida

- Existe middleware y esta documentado
- Los controles de cache alcanzan para apps reales
- Las limitaciones de SSR son claras o estan parcialmente resueltas
- La libreria ya tiene una o dos fortalezas faciles de explicar

### Release objetivo

`v0.5.x`

---

## Etapa 4: Validacion de Adopcion

### Objetivo

Decidir si la libreria debe seguir enfocada y de nicho, o crecer hacia una plataforma mas amplia.

### Prioridad

Estrategica

### Entregables

#### 1. Senales de adopcion

- Medir installs, issues, stars y preguntas reales de usuarios
- Identificar que feature mencionan primero los usuarios
- Identificar donde abandonan o se traban:
  - setup
  - validacion
  - cache
  - soporte de framework

#### 2. Decidir la ruta de crecimiento

Direcciones posibles:

- Ruta A: mantenerse minimalista
  - ideal para equipos que quieren una capa REST tipada y pequena

- Ruta B: convertirse en una capa frontend de datos mas fuerte
  - agregando mas orquestacion de cache y mutaciones

- Ruta C: moverse hacia tooling contract-first
  - definiciones compartidas, generadores y adapters

No seguir las 3 rutas al mismo tiempo.

#### 3. Activos de comunidad

- Guia `CONTRIBUTING`
- templates de issues
- seccion de roadmap en README
- pagina de comparacion

### Criterios de salida

- Usuarios reales pueden explicar por que eligieron la libreria
- Una direccion de producto gana con claridad
- El alcance futuro se decide con base en uso real, no en intuicion

### Release objetivo

`v0.6.x+`

---

## Orden Recomendado de Features

Si el tiempo de desarrollo es limitado, construir en este orden:

1. Corregir README y promesas publicas
2. Unificar runtime core
3. Validar `body`, `query` y `params`
4. Agregar tests
5. Agregar serializacion estable de query keys
6. Agregar cancelacion
7. Agregar middleware o interceptors
8. Publicar un adaptador real de Vue o quitarlo
9. Agregar ejemplos y mejorar CI
10. Revaluar expansion mas amplia

## Metricas de Exito

Buenas metricas tempranas:

- Los usuarios integran la libreria en menos de 15 minutos
- Disminuyen los problemas de documentacion inconsistente
- Los tests cubren todo el comportamiento core de cache y fetch
- Las releases publicas no rompen los ejemplos
- Empieza a surgir al menos una razon repetible de adopcion

Ejemplos de razones fuertes de adopcion:

- "Me da REST tipado con cache sin meter una pila enorme"
- "Es mas simple que TanStack Query para dashboards CRUD"
- "Se siente mas limpio que armar fetch, schemas e invalidacion a mano"

## Riesgos

### Riesgo 1: categoria poco clara

Si el paquete intenta ser transport layer, query library y sistema de contratos al mismo tiempo, el posicionamiento se vuelve confuso.

Mitigacion:

- mantenerse enfocado en cliente REST tipado + capa de cache

### Riesgo 2: prometer mas de lo que existe

Decir que soporta Vue o Solid antes de que sean reales lastima la confianza muy rapido.

Mitigacion:

- documentar solo lo implementado

### Riesgo 3: competir por amplitud

Intentar superar en features a TanStack Query o a ecosistemas OpenAPI probablemente sea una mala batalla.

Mitigacion:

- ganar por simplicidad, peso y ergonomia

### Riesgo 4: huecos de correccion en cache

Los bugs sutiles de cache destruyen la confianza rapidamente.

Mitigacion:

- muchos tests alrededor de invalidacion, stale y deduplicacion

## Hito Recomendado de Corto Plazo

El siguiente hito mas fuerte es:

### `v0.3.0 - Core honesto, estable y listo para uso publico`

Alcance:

- README preciso
- validacion del lado de request
- runtime core unificado
- tests estables del core
- limpieza de claims sobre frameworks

Si `v0.3.0` sale bien, la libreria tiene futuro real.
Si ese hito cuesta demasiado estabilizarlo, sera una senal de que la arquitectura necesita ajustarse antes de sumar mas features.

## Recomendacion Final

Vale la pena seguir con esta libreria.

Ya tiene la semilla de un producto util:

- mas simple que los stacks grandes de data fetching
- mas estructurado que wrappers de bajo nivel sobre fetch
- lo bastante pequeno como para seguir siendo atractivo

La mejor jugada ahora no es crecer rapido en features. La mejor jugada es volver la promesa actual solida, testeada y precisa. Cuando esa base sea confiable, crecer sera mucho mas realista.
