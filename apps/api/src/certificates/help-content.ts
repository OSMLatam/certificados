export const HELP_MARKDOWN = `# Ayuda

## ¿Cómo encuentro mi certificado?
En [Buscar certificados](/) escribe **una** de estas dos cosas:
- el **correo** con el que te inscribiste; o
- tu **documento**: el país (por ejemplo, CO), el tipo (CC, CE o TI) y el número, sin puntos.

Verás la lista de tus certificados. Si participaste con más de un rol (por ejemplo, como ponente y como asistente), tendrás uno por cada rol. Haz clic en el que necesites.

El formulario se puede usar solo con el teclado: Tab para pasar de un campo a otro y Enter para buscar.

## No encuentro mi certificado
- Prueba con el otro dato. Si buscaste por correo, busca por documento, o al revés. Puede que el organizador haya registrado solo uno de los dos.
- Revisa que el correo o el número estén bien escritos.
- Puede que el organizador aún no haya publicado los certificados del evento. Pregúntale.

## ¿Qué es el enlace de mi certificado?
Cada certificado tiene su propia página, con una dirección como \`{{PUBLIC_BASE_URL}}/c/AbC123xyZ\`. Puedes compartirla, por ejemplo en tu hoja de vida o en una red social. Allí está el botón **Descargar certificado** para bajar el PDF.

La página muestra tu nombre, el evento, tu rol, la fecha y tu documento **enmascarado** (por ejemplo, «CC ******0103»). **No muestra tu correo.**

La primera vez que se abre el enlace, el certificado se genera; puede tardar unos segundos.

## ¿Cómo se comprueba que un certificado es auténtico?
- Abre su enlace o escanea el código QR del PDF, y **mira que la dirección sea la de este sitio**. Un certificado es válido si su página aquí dice «Estado: Válido».
- Cada certificado se verifica de uno en uno, con su propio enlace.
- La página muestra la **suma de comprobación** (SHA-256), una huella del archivo PDF. Si alguien quiere asegurarse de que un PDF no fue alterado, puede calcular la suma de ese archivo y compararla con la de la página: si coinciden, es el mismo archivo.
- La firma que aparece en el PDF es una imagen, no una firma digital. Lo que da validez es la página del certificado en este sitio.

## ¿Qué significa «Revocado»?
El organizador anuló ese certificado, por ejemplo porque tenía un error. Ya no es válido y no se puede descargar. Si crees que es un error, escribe al organizador del evento o al correo de contacto que aparece en [Datos personales](/privacy).

## ¿Qué significa «No encontrado»?
El enlace no existe o está mal copiado. Revisa que esté completo, o busca tu certificado con tu correo o tu documento.

## Mi nombre o mi documento están mal
Escribe al correo de contacto que aparece en [Datos personales](/privacy) e indica el evento y el dato correcto. El organizador anulará el certificado con el error y emitirá uno nuevo.

## Mis datos personales
Qué datos guardamos, para qué y cómo pedir que los corrijamos o los borremos: [Datos personales](/privacy). No hay un botón para darse de baja: se pide por correo, para poder verificar que eres tú.

[Acerca de este sitio](/about)
`;
