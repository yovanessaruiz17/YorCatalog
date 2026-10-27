# YORCATALOG (PWA)

> Progressive Web App comercial para gestión de inventario, creación de catálogos digitales interactivos, revistas virtuales tipo folio y recepción estructurada de pedidos por WhatsApp.

---

## 📌 Estado del Proyecto: Fases 1, 2, 3 y 4 Completadas

El desarrollo se realiza estrictamente en 5 fases:

- ✅ **Fase 1:** Fundación técnica, diseño comercial editorial, sistema de temas y navegación completa.
- ✅ **Fase 2:** Inventario real (CRUD), importación CSV en 5 pasos con preservación de ceros en EAN y asociación masiva de imágenes (ZIP, nombres EAN, mapeo manual).
- ✅ **Fase 3:** Diseñador de catálogos, 4 plantillas comerciales, snapshots inmutables y generador nativo de PDF vectorial con QR dinámico.
- ✅ **Fase 4:** Revista virtual pública, catálogo interactivo con lectura autónoma, carrito de compras, pedidos estructurados por WhatsApp y auditoría comercial.
- ⏳ **Fase 5:** Persistencia definitiva (PostgreSQL / Supabase), seguridad RLS, pruebas integrales y despliegue a producción.

---

## 🛠️ Pila Tecnológica (Tech Stack)

- **Framework:** React 19 + TypeScript (en modo estricto).
- **Herramienta de Compilación:** Vite.
- **Enrutamiento:** React Router (v7).
- **Estilos:** Tailwind CSS v4 con tipografía editorial (`Plus Jakarta Sans`, `Playfair Display`, `JetBrains Mono`).
- **PWA:** `vite-plugin-pwa` con manifiesto completo, iconos Android/iOS (192px, 512px, maskable, apple-touch-icon), service worker y hook de instalación in-app `usePWAInstall`.
- **Generación Vectorial de PDF:** `jspdf` para trazado vectorial nativo multipágina con paginación y precarga CORS segura.
- **Códigos QR Vectoriales:** `qrcode` para codificación de enlaces públicos dinámicos hacia la revista virtual.
- **Descompresión ZIP en cliente:** `jszip` con protección activa contra zip bombs y path traversal.
- **Iconografía:** `lucide-react`.
- **Arquitectura de Servicios:** Desacoplada mediante interfaces TypeScript (`IProductService`, `ICatalogService`, `IImportService`, `IOrderService`, `ISettingsService`), con adaptador de desarrollo en memoria y sincronización en localStorage.

---

## 📖 Fase 3: Diseñador de Catálogos, Plantillas y Generador de PDF

### 1. Biblioteca de Plantillas Editoriales (`/templates` y `templateCatalog.ts`)
Se implementaron 4 plantillas comerciales diferenciadas:
1. **Minimalista (`minimal`):** 2 columnas con bordes sutiles, amplio espacio negativo y tipografía sans-serif. Ideal para cosmética, diseño y tecnología.
2. **Editorial Luxe (`editorial`):** 2 columnas con tipografía serif (`Playfair Display`), paleta ámbar y dorada, e insignias de alta gama. Para cafés de especialidad, moda y gastronomía gourmet.
3. **Promocional / Ofertas (`promotional`):** 3 columnas con badges de descuento automáticos (`-XX% OFF`), precio anterior tachado y contrastes llamativos.
4. **Cuadrícula por Categorías (`category_grid`):** 3 columnas con agrupación automática por categoría y banners divisorios. Pensado para distribución mayorista y ferretería.

### 2. Selector Avanzado de Productos del Inventario
- **Búsqueda reactiva:** Filtra en tiempo real por nombre, SKU o código EAN.
- **Filtros combinados:** Filtro por categoría y conmutador booleano "Solo productos con imagen".
- **Selección masiva:** Botones para seleccionar/deseleccionar todos los resultados filtrados con un clic.
- **Reordenamiento manual:** Botones para desplazar la posición de los productos (`orderIndex`) y fijar su orden exacto en el catálogo.
- **Eliminación no destructiva:** Quitar productos de un catálogo no afecta el inventario global.

### 3. Editor Visual en Tiempo Real
- **Panel por pestañas:** Configuración de Portada (títulos, subtítulos, branding, cabeceras y pies), Selección de Productos, Plantilla & Estilos (paleta cromática hex, fuentes, columnas) y Visibilidad de Precios/Códigos.
- **Simulador de páginas interiores:** Previsualización en pliegos con navegación interactiva página a página antes de generar el PDF.

### 4. Generación Real de PDF Vectorial (`pdfGenerator.ts`)
- **Trazado nativo jsPDF:** Exportación multipágina nítida mediante dibujo vectorial sin utilizar capturas de pantalla DOM (`html2canvas`).
- **Paginación inteligente:** Cálculo algebraico de la altura y posición de tarjetas por página según el número de columnas (1, 2 o 3 columnas).
- **Precarga CORS segura:** Conversión de imágenes en Data URLs mediante `<canvas>` con mecanismo de respaldo vectorial si la imagen externa falla.
- **Códigos QR Vectoriales:** Generación directa con `qrcode` que apunta a la URL pública del catálogo cuando se encuentra publicado.

### 5. Instantáneas Inmutables (Frozen Snapshots)
- Cada producto dentro de un catálogo contiene un objeto `snapshot: Product` con sus datos en el momento de la inclusión. Modificar el inventario en `/products` no altera de manera retroactiva los catálogos existentes.
- Flujo de publicación con control de versiones (`version: 1`, `version: 2`) y congelación de snapshots.

---

## 📄 Formato CSV Aceptado y Reglas del Validador

### Encabezados Admitidos (Bilingüe es/en)
El motor de importación (`csvParser.ts`) detecta automáticamente las columnas y permite su ajuste manual en el Paso B:

| Campo | Encabezados Aceptados en Español | Encabezados Aceptados en Inglés | Obligatorio |
| :--- | :--- | :--- | :--- |
| **Nombre** | `nombre`, `producto`, `titulo`, `item` | `name`, `product`, `title` | **Sí** |
| **SKU** | `sku`, `referencia`, `codigo`, `cod_producto` | `sku`, `code`, `id_producto` | **Sí** |
| **EAN** | `ean`, `ean13`, `codigo_barras`, `codigo_de_barras` | `ean`, `barcode`, `upc` | No (Recomendado) |
| **Precio** | `precio`, `precio_venta`, `valor`, `pvp` | `price`, `sale_price` | **Sí** |
| **Precio Anterior** | `precio_comparacion`, `precio_anterior`, `pvp_anterior` | `compare_at_price`, `old_price` | No |
| **Categoría** | `categoria`, `linea`, `grupo`, `departamento` | `category`, `categoryId` | No (default: 'General') |
| **Marca** | `marca`, `fabricante` | `brand`, `manufacturer` | No |
| **Stock** | `stock`, `cantidad`, `existencias`, `inventario` | `stock`, `qty`, `quantity` | No (default: 0) |
| **Descripción** | `descripcion`, `detalle`, `detalles` | `description`, `notes` | No |
| **Imagen** | `imagen`, `url_imagen`, `foto` | `image`, `imageUrl`, `picture` | No |
| **Activo** | `activo`, `estado`, `habilitado` | `active`, `status`, `enabled` | No (default: true) |

### Reglas de Parseo y Formato Decimal
1. **Delimitadores:** Autodetección entre coma (`,`), punto y coma (`;`) y tabulación (`\t`).
2. **Campos con comillas:** Cumple con RFC 4180; admite comas internas, comillas escapadas (`""`) y saltos de línea dentro de celdas.
3. **Cero inicial en EAN:** El código EAN se trata **estrictamente como texto (`string`)** en todo el flujo. Nunca se convierte a número para evitar que `"0770200100456"` se transforme en `770200100456`.
4. **Validación Decimal:** Admite formatos `$ 48.000` (COP), `48000.00` y `48.000,50` convirtiéndolos a valores decimales limpios.
5. **Detección de Duplicados:** Detecta SKUs y EANs repetidos dentro del mismo CSV y contra el inventario existente.
6. **Resolución de Conflictos:**
   - *Actualizar productos existentes:* Sobrescribe con protección opcional para no alterar precios o imágenes existentes.
   - *Omitir productos existentes:* No toca los registros en conflicto e importa únicamente los nuevos.
   - *Crear como nuevo:* Genera un SKU derivado con sufijo `-N`.

---

## 🖼️ Reglas de Asociación de Imágenes por EAN

El módulo de imágenes (`imageService.ts`) procesa archivos mediante 4 métodos:
1. **Método A (Nombres directos por EAN):** Archivos nombrados con el EAN exacto (ej. `0770200100456.jpg`, `0770200100456.png`, `0770200100456.webp`).
2. **Método B (Carga masiva / Paquete ZIP):** Extracción segura en el navegador de paquetes `.zip`.
3. **Método C (Columna de imagen en CSV):** URLs externas o nombres de archivos coincidentes.
4. **Método D (Asociación Manual):** Interfaz para buscar productos y reasignar o corregir asociaciones visualmente.

### Reglas de Coincidencia:
- **Normalización:** Se elimina la extensión y se extrae el identificador base.
- **Sufijos permitidos:** Se admiten sufijos con separador guión bajo o medio (ej. `0770200100456_front.jpg`, `0770200100456-1.webp`).
- **Coincidencias estrictas:** No se realizan coincidencias aproximadas o difusas (fuzzy) en EAN para garantizar que ningún producto reciba una foto incorrecta.
- **Estados de asociación:**
  - `exact_match`: Coincidencia exacta única entre el EAN del archivo y el producto.
  - `pending_review`: Ambigüedad (múltiples productos comparten el mismo EAN).
  - `confirmed`: Asociación aprobada por el usuario en el inventario.
  - `no_image`: Imagen sin producto coincidente en inventario.
  - `invalid_image`: Archivo no válido o sin EAN reconocible.

---

## 🔒 Límites de Archivos y Seguridad

- **Archivos CSV:** Máximo 10 MB por archivo.
- **Archivos ZIP:**
  - Máximo 200 archivos por archivo comprimido.
  - Máximo 50 MB de tamaño total descomprimido (protección activa contra ZIP bombs).
  - Protección contra *Directory Traversal* (se ignoran rutas relativas que contengan `..` o prefijos absolutos).
  - Rechazo de ejecutables (`.exe`, `.bat`, `.sh`, `.php`, etc.). Solo se extraen extensiones de imagen permitidas (`jpg`, `jpeg`, `png`, `webp`, `svg`).
- **Gestión de Memoria:** Conversión eficiente a Data URLs o blob URLs administradas.

---

## 🧪 Pruebas Realizadas y Botones de Prueba en Memoria

Para facilitar la evaluación inmediata sin requerir archivos externos del usuario:
1. **Asistente CSV:** Dispone de botones para cargar directamente:
   - *CSV de Prueba Válido:* 3 productos nuevos con EAN formateado y precios en COP.
   - *CSV con Conflictos y Duplicados:* Registros con SKUs repetidos, productos ya existentes y precios inválidos para comprobar el validador y la descarga del reporte de errores.
2. **Asociador de Imágenes:** Dispone del botón *"Probar con Imágenes Demo"* que carga imágenes de muestra para los productos con imágenes pendientes (ej. Molinillo Manual y Taza Cerámica).
3. **Operaciones CRUD:** Probadas en `/products`:
   - Creación manual con validación de SKU duplicado.
   - Edición de precio, categoría y stock.
   - Activación y desactivación individual y en lote.
   - Eliminación individual y masiva con modales de confirmación.
   - Filtros combinados de búsqueda, categoría, estado y ordenamiento.

---

## ⏳ Dependencias Externas Pendientes (Para Fase 5)

- **Supabase Client:** Para persistencia PostgreSQL multiusuario en la nube con Row Level Security (RLS).
- **Supabase Storage:** Para almacenamiento remoto de fotografías de alta resolución en buckets privados/públicos.
- **Supabase Auth:** Para control de acceso y espacios de trabajo empresariales.

---

## 🚀 Próxima Fase

**Fase 4: Revista virtual pública, catálogo interactivo, carrito de compras y recepción de pedidos por WhatsApp.**  
*(En espera de la instrucción específica del usuario).*
