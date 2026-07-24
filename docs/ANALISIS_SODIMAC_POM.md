# Análisis: Credenciales y Documentación Sodimac POM

## Qué compartiste (AsyncAPI Streetlights)

El archivo compartido es el **ejemplo de demostración oficial de AsyncAPI** — el "Hello World" que usan para explicar la tecnología. Es sobre **semáforos callejeros** y usa **Kafka**. No tiene nada que ver con Sodimac ni con las OC de Ingrill.

---

## Los 3 documentos que ya tienes vs lo que falta

| Documento | Lo tienes | Es suficiente |
|---|---|---|
| `purcharseOrder-outboundV5-provider.yml` | ✅ | Contrato del evento (formato JSON de la OC) |
| `Manual_Integracion_Vendor_POM.pdf` | ✅ | Guía de cómo conectarse |
| **Cuenta de servicio Google Cloud** | ❌ | **Falta** — sin esto no puedes conectarte |
| **Nombre de la suscripción** | ❌ | **Falta** — sin esto no sabes a qué "buzón" hacer Pull |

---

## Cómo se ve el archivo que realmente necesitas

El archivo que Sodimac debe entregarte se llama usualmente algo como `service-account-ingrill.json` y tiene esta estructura:

```json
{
  "type": "service_account",
  "project_id": "fal-corp-mrch-prchord-prod",
  "private_key_id": "abc123...",
  "private_key": "-----BEGIN RSA PRIVATE KEY-----\n...",
  "client_email": "ingrill-vendor@fal-corp-mrch-prchord-prod.iam.gserviceaccount.com",
  "client_id": "123456789",
  "auth_uri": "https://accounts.google.com/o/oauth2/auth",
  "token_uri": "https://oauth2.googleapis.com/token"
}
```

Y también necesitas el **nombre de tu suscripción**, que sería algo como:
```
projects/fal-corp-mrch-prchord-prod/subscriptions/rtl-corp-mrch-prch-purchaseorder-outbound-vendor-ingrill-sub
```

---

## ¿Qué debes hacer?

**Contactar al equipo de integración de Sodimac/Falabella** y pedirles:

> *"Necesitamos el archivo JSON de la cuenta de servicio (Service Account) y el nombre de la suscripción para conectarnos al topic POM de órdenes de compra en Google Cloud Pub/Sub."*

---

## Resumen del Manual PDF (Manual_Integracion_Vendor_POM.pdf)

### Tecnología: Google Cloud Pub/Sub
No es una REST API. Es un sistema de **mensajería por eventos en la nube de Google**. Sodimac/Falabella publica las OC en un "Topic" y tú como consumidor haces **Pull** para recibirlas.

### Flujo de cómo recibes una OC

```
Sodimac crea OC  →  Publica en GCP Pub/Sub Topic
                           ↓
                  Tu sistema hace Pull  ←  (debes programar esto)
                           ↓
                  Recibes el mensaje JSON (la OC)
                           ↓
                  Envías ACK (confirmación) en < 60 seg
                           ↓
                  Pub/Sub elimina el mensaje
```

### Artefactos que Sodimac debe entregarte

| Artefacto | Para qué sirve |
|---|---|
| **Contrato AsyncAPI** | El YAML que ya tienes (el spec del formato de los mensajes) ✅ |
| **Nombre de la suscripción** | El nombre del "buzón" donde llegan TUS OC |
| **Cuenta de servicio (JSON)** | Las credenciales Google para autenticarte |
| **Manual de integración** | El PDF ✅ |

### Estados de las OC que llegarían

| ID | Estado | Significado |
|---|---|---|
| 1 | Released | OC aprobada y lista → **debes surtir** |
| 4 | Partial Reception | Bodega recibió parcialmente |
| 5 | Full Reception | Bodega recibió todo |
| 6 | Canceled With Partial Reception | Cancelada con algo recibido |
| 7 | Canceled | Cancelada |
| 20 | Entering Mode | En proceso de entrada |

### Dato crítico — Credenciales
> **Rotación cada 30 días, vigencia 60 días.** Si no renuevas, dejas de recibir OC.

### Comportamiento de reintentos
- ACK deadline: **60 segundos** desde recepción del mensaje
- Si no se envía ACK a tiempo → mensaje se reencola
- Reentrega: ~80 segundos después
- Política de backoff exponencial: +20 seg por cada intento fallido

---

## Diferencia entre las dos APIs de Sodimac

### API Seller Center (marketplace — ya integrada en el dashboard)
Ingrill vende **directamente a consumidores finales** a través de falabella.com/sodimac.com como marketplace:

| Campo | Dato |
|---|---|
| Comprador | Persona (Juan Pérez) |
| Volumen típico | 1-2 unidades |
| Precio | Precio retail al consumidor |
| Estado de pago | Pagado al momento de la compra |

### API POM / AsyncAPI GCP Pub/Sub (órdenes de compra B2B — por integrar)
Sodimac/Easy/Tottus envía una **Orden de Compra (OC) al por mayor** para surtir sus tiendas físicas:

| Campo | Dato concreto del spec |
|---|---|
| **N° de OC** | `localCode` + `corpCode` |
| **Productos pedidos** | `products[].sku`, `products[].description`, `products[].barCodeValue` (EAN) |
| **Unidades pedidas** | `purchasedUnits` (ej: 1001 unidades) |
| **Unidades canceladas** | `canceledUnits` |
| **Unidades recibidas** | `receivedUnits` |
| **Unidades pendientes** | `onOrderUnits` = purchasedUnits − receivedUnits |
| **Precio unitario costo** | `catalogCost` en USD/CLP |
| **Centro de costo destino** | `costCenterName` → qué bodega/tienda Sodimac |
| **Tipo de OC** | `type` → REPLENISHMENT / VeV / PUSH |
| **Estado de la OC** | `status` → RELEASED / PENDING / CANCELLED |
| **Fecha máxima de embarque** | `lsd` (Last Shipment Date) |
| **Fecha llegada estimada** | `eta` |
| **Asignación por tienda** | `allocations[].facilityAllocationName` → "Arauco", "Maipú", etc. |
| **Empresa compradora** | `commerce` → SOD / FAL / TOT |

### Esquema de canales

```
Canal B2C (ya integrado):          Canal B2B (por integrar):
─────────────────────────          ──────────────────────────
Shopify Web    → 1-3 und           Sodimac OC #2569 → 500 und
Mercado Libre  → 1-2 und           Easy OC #1841   → 300 und
Ripley MKT     → 1-2 und           Tottus OC #3302 → 200 und
Sodimac MKT    → 1-2 und
```
