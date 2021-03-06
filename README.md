# Implémenter et consommer les Streams "Readable" et "Writable" de Node.js

![Streams](./img/stream.jpg)

Les [Streams](https://nodejs.org/api/stream.html) sont vraiment au cœur de [Node.js](https://nodejs.org/) !

Si vous avez touché à Node.js, vous avez très certainement manipulé des Streams, sans forcément vous en rendre compte... À titre d'exemples, `HTTP IncomingMessage/ServerResponse`, `Net Socket`, `Process stdin/sdtout`, `Zlib` et `Crypto`, implémentent tous l'interface Streams.

Si vous souhaitez mettre dans votre CV "Développeur Node.js", vous ne pouvez pas vous contenter de connaître le framework Express et autres paquets NPM non moins indispensables. Vous serez au mieux un "Développeur NPM", mais je ne suis pas sûr qu'un tel poste existe vraiment... Ce serait un peu comme si vous vouliez être un développeur JavaScript avec seulement jQuery dans votre arsenal (ça vous rappelle peut-être quelque chose). Alors, si vous voulez vraiment être à l'aise avec les Streams et devenir un Ninja en Node.js, vous êtes au bon endroit !

__Dans cet article, je vais vous expliquer en détail, le fonctionnement interne des Streams "Readable" et "Writable", pour que vous soyez vraiment à l'aise pour en implémenter et en consommer.__

Et pour que tout cela soit vraiment fun, je vais utiliser [TypeScript](https://www.typescriptlang.org) comme langage de programmation et [Jest](https://jestjs.io) comme framework de test.

Les exemples de code de cet article sont disponibles dans le dépôt Git suivant :
[https://github.com/xebia-france/nodejs-streams](https://github.com/xebia-france/nodejs-streams).

Mais avant de coder, commençons par définir ce qu'est un Stream.

## Mais alors un Stream c'est quoi ?

Un __Stream__, c'est un flot de données de __taille inconnue__, dont le contenu est accessible par paquets ("chunk" en anglais) au fil du temps, de manière __asynchrone__. On peut l'opposer au Buffer. Un __Buffer__ est un bloc de données de __taille connue__ à l'avance et dont le contenu est accessible de manière __synchrone__.

Prenons un exemple.

Lire une vidéo dans un Buffer, vous oblige à la télécharger entièrement avant d'en commencer la lecture. À contrario, la lire en Streaming vous permet de lancer la lecture presque immédiatement, dès que les premiers "chunks" ont été téléchargés. En d'autres termes, dans un Buffer, une donnée incomplète est une donnée corrompue et n'est donc pas exploitable, alors que dans un Stream, la donnée est consultée dans une fenêtre temporelle et est donc par nature, incomplète à chaque instant.

En fait, en interne, un Stream utilise justement un Buffer comme zone tampon, pour stocker les chunks qu'il détient.

Lorsqu'un Stream produit des chunks, qu'il stocke donc dans son Buffer interne en vue de leur consommation par l'extérieur, on dit que ce Stream est accessible en lecture (ou "Readable"). Et lorsque depuis l'extérieur, on peut pousser des chunks dans le Buffer interne d'un Stream en vue de leur traitement, on dit que ce Stream est accessible en écriture (ou "Writable").

Mais un Stream, c'est aussi un émetteur d'événements (ou "EventEmitter"), auxquels vous allez pouvoir vous abonner pour le suivre, tout au long de son cycle de vie. Par exemple, un Stream "Readable" va émettre un événement `"readable"`, pour indiquer à celui qui le consomme, que de la donnée est prête à être consommée.

En résumé, l'équation est assez simple :
__[Buffer](https://nodejs.org/api/buffer.html) + [EventEmitter](https://nodejs.org/api/events.html) = [Stream](https://nodejs.org/api/stream.html)__.

## Rappel sur les `Buffer` et `EventEmitter`

L'étude détaillée des `Buffer` et `EventEmitter` de Node.js, dépasse le cadre de cet article, qui se concentre sur les Streams. Mais un résumé de ces notions importantes s'impose, pour vous permettre d'en poursuivre la lecture sereinement.

### Buffer

Un Buffer, c'est un conteneur dans lequel est stockée de la donnée au format binaire. On peut le voir comme un tableau de `Bytes`, c'est-à-dire un tableau de nombres compris entre `0` et `255`.

```ts
const string = 'vidéo';
const buffer = Buffer.from(string, 'utf8');
const bytes = Array.from(buffer.values());
const string2 = Buffer.from(bytes).toString();

expect(string.length).toBe(5); // car il y a bien 5 caractères dans 'vidéo'
expect(buffer.length).toBe(6); // 6 et non 5, car le "é" de "vidéo" est encodé sur 2-bit!
expect(bytes).toEqual([118, 105, 100, 195, 169, 111]); // C'est bien un tableau de nombres entre 0 et 255
expect(string2).toBe(string); // Ouf!
```

Dans cet exemple, `string` est stocké dans `buffer` qui est bien un tableau de `bytes` que nous reconvertissons en `string2`.

### EventEmitter

Node.js est basé sur une architecture orientée événement ("event-driven"). Cela signifie que les traitements des opérations asynchrones sont déclenchés, en réponse à des événements.

```ts
const source = new EventEmitter();
const event = 'foo';
const data1 = 'bar';
const data2 = ['qix'];

const listenerMock = jest.fn();

// On enregistre la fonction qui va traiter les données émises
source.on(event, listenerMock);

// On émet la donnée au travers d'événements
source.emit(event, data1);
source.emit(event, data2);

expect(listenerMock).toHaveBeenNthCalledWith(1, data1);
expect(listenerMock).toHaveBeenNthCalledWith(2, data2);
```

Dans cet exemple, `source` émet des événements `event`, auxquels s'est abonné `listenerMock` afin de traiter successivement `data1` et `data2`.

_Après cette introduction, il est temps de rentrer dans le vif du sujet._

## Les Streams "Readable"

Pour cette partie, vous allez implémenter un Stream nommé `ReadableCounter`, qui émet des nombres de 1 à 6, puis se termine.

Pour cela, vous devez créer une classe enfant qui hérite de la classe `Readable`, dont le contrat d'interface vous demande d'implémenter la méthode `_read()`. La méthode `_read()` a pour rôle d'émettre des chunks, en appelant au moins une fois la méthode `push(chunk)`, de manière synchrone ou asynchrone. Et pour terminer le Stream, vous devez appeler la méthode `push` avec `null` en paramètre, comme ceci: `push(null)`.

```ts
import { Readable } from 'stream';

class ReadableCounter extends Readable {
  data = 0;

  _read() {
    this.data += 1;

    if (this.data <= 6) {
      const chunk = this.data.toString();
      this.push(chunk);
    } else {
      this.push(null);
    }
  }
}
```

Le consommateur de votre Stream ne doit pas appeler la méthode `_read()`, considérée privée. C'est Node.js qui va l'appeler pour lui, au moment opportun, autant de fois qu'il le faut.

Nous allons revenir sur ce point essentiel un peu plus loin, mais tout d'abord voyons comment consommer votre Stream.

### Les modes "paused" et "flowing"

Un Stream Readable a 2 modes de fonctionnement possibles : à l'arrêt ("paused") ou en train de s'écouler ("flowing"). Et paradoxalement, on peut le consommer dans l'un comme dans l'autre de ces modes (et donc même s'il est "paused" !).

À sa création, un Stream Readable est en mode "paused". La méthode `isPaused()` permet de déterminer tout au long de son cycle de vie, le mode dans lequel il opère.

#### En mode "flowing"

Pour consommer un Stream Readable, le plus simple consiste à le passer en mode "flowing" pour qu'il commence à émettre des chunks.

Pour cela, le consommateur doit se mettre à l'écoute des événements `"data"` comme ceci :

```ts
const readable = new ReadableCounter();

expect(readable.isPaused()).toBeTruthy();

readable.on('data', chunk => {
  // Faire quelque chose avec `chunk`...
});

expect(readable.isPaused()).toBeFalsy();
```

...ou appeler directement la méthode `resume()`, comme cela :

```ts
const readable = new ReadableCounter();

expect(readable.isPaused()).toBeTruthy();

readable.resume();

expect(readable.isPaused()).toBeFalsy();
```

Notez qu'avec uniquement `resume()`, comme dans l'exemple ci-dessus, les chunks sont bel et bien émis mais du même coup perdus, puisque personne ne les récupère.

En mode "flowing", le Stream se comporte en réalité comme un simple `EventEmitter` et les chunks émis ne transitent pas vraiment par le Buffer interne dont je vous ai parlé plus haut. Voyons maintenant le mode "paused" qui va quant à lui, pleinement exploiter ce fameux Buffer interne.

#### En mode "paused"

Pour consommer le Stream en mode "paused", le consommateur doit se mettre à l'écoute des événements `"readable"`.

```ts
const readable = new ReadableCounter();

expect(readable.isPaused()).toBeTruthy();

readable.on('readable', () => {
  let chunk: any;
  while ((chunk = readable.read()) !== null) {
    // Faire quelque chose avec `chunk`...
  }
});

expect(readable.isPaused()).toBeTruthy();
```

Cette fois, le Stream émet les chunks en les stockant dans son Buffer interne. C'est au consommateur d'appeler la méthode publique `read()` (sans "_") de manière synchrone, pour tirer la donnée jusqu'à vider le Buffer interne.

> En résumé, on peut assimiler la consommation en mode "flowing" aux "push notifications" des WebSockets et la consommation en mode "paused" aux "pull data" d'une API Rest.

Revenons maintenant à la méthode privée `_read()`. À quels moments est-elle appelée par Node.js ?

### Séquence des appels de la méthode `_read()`

La méthode `_read()` est appelée pour la première fois lorsque le consommateur se met à l'écoute des événements `"data"` ou `"readable"` (ou suite à l'appel de la méthode `resume()`).

Le contrat de la méthode `_read()` est, comme nous l'avons dit plus haut, d'appeler au moins une fois, de manière synchrone ou pas, la méthode `push(chunk)`. Une fois ce contrat rempli, Node.js rappelle immédiatement la méthode `_read()` pour demander à votre Stream de nouveaux chunks, et ainsi de suite. Ce cercle "vertueux" n'est interrompu que lorsque vous appelez `push(null)`, pour indiquer que votre Stream est terminé.

Cependant, il existe un cas où Node.js va différer le rappel de la méthode `_read()`. Pour aborder ce cas, nous devons comprendre ce qui se passe, lorsque votre Stream émet des chunks plus vite qu'ils ne sont consommés. Allons-y !

D'un côté, dans l'implémentation de votre Stream, vous appelez la méthode `push()` pour remplir le Buffer interne avec des chunks. Et de l'autre côté, le consommateur de votre Stream appelle la méthode publique `read()` pour récupérer ces chunks et vider le Buffer interne. Mais si les chunks ne sont pas consommés assez vite, le Buffer interne va alors progressivement se remplir jusqu'à atteindre sa taille limite, appelée `highWaterMark`.

Lorsque cela se produit, Node.js casse le fameux cercle "vertueux" dont je vous ai parlé plus haut en ne rappelant pas `_read()` suite à votre appel à `push()`. Le Stream reste ainsi à l'arrêt, jusqu'à ce que le consommateur parvienne à vider le Buffer interne, à son rythme. Et c'est seulement alors, que Node.js rappelle enfin la méthode `_read()`, pour relancer le Stream et demander de nouveaux chunks à votre implémentation.

Pour vous permettre de prendre en compte ce comportement, la méthode `push()` retourne un boolean. Et `push(chunk)` va retourner `false` pour le `chunk` qui entraine le dépassement de la taille limite du Buffer interne.

Cela est très utile par exemple, si vous appelez la méthode `push()` plusieurs fois dans l'implémentation de votre méthode `_read()`, comme ceci :

```ts
class ReadableCounter extends Readable {
  _read() {
    for (let i = 0; i < 10, i++) {
      if (!this.push('some chunk')) {
        break;
      }
    }
  }
}
```

Comprenez bien que ce comportement a pour but de vous permettre de réguler votre Stream (en termes de gestion de la mémoire), mais que cette régulation n'est pas stricte. Car, même si vous continuez d'appeler `push(chunk)` lorsque `highWaterMark` a été dépassé, Node.js ne lèvera pas d'erreurs.

En résumé, si la méthode `push(chunk)` retourne `true` alors Node.js rappelle immédiatement la méthode `_read()`. Sinon, cet appel est différé au moment où le Buffer interne parvient à être vidé, suite aux appels de la méthode `read()`.

![Séquence des appels _read()](./img/sequence-read.png)

Notez que la propriété `highWaterMark`, dont la valeur par défaut est `16Kb`, est configurable dans le constructeur de la classe `Readable`.

```ts
class ReadableCounter extends Readable {
  constructor(highWaterMark = 16384) {
    super({ highWaterMark });
  }
}
```

> Si vous avez survécu à cette première partie, sachez que vous avez passé le plus dur ! Contrairement aux Streams "Readable", les Streams "Writable" sont plus simples à appréhender.

## Les Streams "Writable"

Pour cette partie, vous allez implémenter un Stream nommé `WritableLogger` qui affiche en temps réel, les chunks qui lui sont poussés ainsi que la taille de son Buffer interne.

Pour cela, vous devez créer une classe enfant qui hérite de la classe `Writable`, dont le contrat d'interface vous demande d'implémenter la méthode `_write(chunk, encoding, next)` avec cette signature bien précise. Cette méthode a pour rôle de traiter le `chunk` reçu et d'appeler la fonction `next()` à l'issue de ce traitement, qui peut prendre plus ou moins de temps.

La propriété `writableLength` permet de déterminer tout au long de son cycle de vie, la taille du Buffer interne.

> Pour le logging, vous allez utiliser le paquet NPM [log-update](https://www.npmjs.com/package/log-update), qui permet comme son nom l'indique, d'afficher puis mettre à jour un texte dans la console, sans changer de ligne. Plutôt pratique pour notre besoin !

```ts
import logUpdate from 'log-update';
import { Writable } from 'stream';

class WritableLogger extends Writable {
  _write(chunk: any, encoding: string, next: (error?: Error) => void): void {
    logUpdate(`length=${this.writableLength} chunk=${chunk}`);
    next();
  }
}
```

Le consommateur de votre Stream ne doit pas appeler la méthode `_write()`, considérée privée. C'est Node.js qui va l'appeler pour lui, au moment opportun, autant de fois qu'il le faut.

Pour consommer votre Stream, il faut pousser des chunks en appelant l'une des méthodes publiques suivantes : `write()` (sans "_") ou `end()`. La méthode `write()` peut être appelée plusieurs fois pour pousser des chunks alors que la méthode `end()` ne peut être appelée qu'une seule fois pour terminer le Stream avec un dernier chunk optionnel en paramètre.

La fonction suivante, nommée `feedStream()`, montre comment consommer votre Stream, en poussant les chiffres de 1 à 6 à intervalles réguliers de 50ms avant de terminer le Stream.

```ts
const writable = new WritableLogger();

let data = 0;

function feedStream(): void {
  data += 1;

  if (data < 6) {
    writable.write(data.toString());
    setTimeout(feedStream, 50);
  } else {
    writable.end(data.toString());
  }
}

feedStream();
```

L'enchaînement est donc assez simple : lorsque le consommateur appelle la méthode `write(chunk)` (ou `end(chunk)`), Node.js appelle en interne la méthode `_write(chunk)`. Cependant, il faut savoir que la méthode `write()` retourne un boolean, en général `true` quand tout va bien. Voyons maintenant quand et pourquoi cette méthode retourne `false` et comment en tenir compte dans votre implémentation.

### Séquence des appels de la méthode `_write()`

Un Stream "Writable" traite les chunks un par un par ordre d'arrivée, de manière séquentielle, préservant ainsi l'ordre des chunks. C'est pourquoi, si le consommateur de votre Stream pousse un nouveau chunk (appel à `write()`) avant que le traitement du précédent ne soit terminé (appel à `next()`), alors le nouveau chunk est stocké dans le Buffer interne.

Mais, si les chunks ne sont pas traités assez vite, le Buffer interne va alors se remplir progressivement jusqu'à atteindre sa taille limite, appelée `highWaterMark`. Lorsque cela se produit, la méthode `write()` retourne `false`, pour indiquer que temporairement, il ne faut plus envoyer de nouveaux chunks (c'est-à-dire ne plus appeler la méthode `write()`).

Ce délai permet au Stream de traiter les chunks en attente, jusqu'à vider son Buffer interne. Et, une fois son Buffer vidé, le Stream émet l'événement `"drain"` pour indiquer qu'il accepte à nouveau des chunks.

Vous pouvez modifier la fonction `feedStream()` pour tenir compte de ce fonctionnement.

```ts
const writable = new WritableLogger();

let data = 0;

function feedStream(): void {
  data += 1;

  if (data < 6) {
    const isWritable = writable.write(data.toString());

    if (isWritable) {
      setTimeout(feedStream, 50);
    } else {
      writable.once('drain', feedStream);
    }
  } else {
    writable.end(data.toString());
  }
}

feedStream();
```

En résumé, le consommateur peut rappeler la méthode `write()` tant que celle-ci retourne `true`. Dès lors qu'elle retourne `false`, il doit attendre que Node.js émette l'événement `"drain"`, indiquant que les chunks en attente ont tous été traités et le Buffer interne vidé.

![Séquence des appels _write()](./img/sequence-write.png)

> Vous savez maintenant comment fonctionnent d'un côté les Streams "Readable" et de l'autre les Streams "Writable". Voyons maintenant comment les connecter entres-eux, avec la méthode `pipe()` ou la fonction `pipeline()`.

## Connecter les Streams "Readable" et "Writable"

Il y a 2 manières de connecter la sortie d'un Stream "Readable" à l'entrée d'un Stream "Writable". La seconde, plus moderne, est apparue avec Node.js dans sa version 10 et permet de mutualiser la gestion des erreurs.

Alors avant de rentrer dans le vif du sujet, abordons tout d'abord la gestion des erreurs dans les Streams.

### Gestion des erreurs

Pour lever une erreur dans un Stream "Readable", vous devez émettre l'événement `"error"`, pour indiquer que vous n'avez pas pu produire la donnée attendue :

```ts
class ReadAndEmitError extends Readable {
  _read(): void {
    this.emit('error', new Error('Unable to read data.'));
  }
}

const readable = new ReadAndEmitError();

readable.on('error', err => console.error(err.message));
```

Pour lever une erreur dans un Stream "Writable" et indiquer que vous n'avez pas pu traiter la donnée reçue, vous pouvez soit émettre l'événement `"error"` (de la même manière que pour un Stream "Readable") :

```ts
class WriteAndEmitError extends Writable {
  _write(): void {
    this.emit('error', new Error('Unable to write data.'));
  }
}

const writable = new WriteAndEmitError();

writable.on('error', err => console.error(err.message));
```

...soit, appeler la fonction `next` et lui fournir l'erreur en paramètre :

```ts
class WriteAndCallNextWithError extends Writable {
  _write(chunk: string, encoding: string, next: (error?: Error) => void): void {
    next(new Error('Unable to write data!'));
  }
}

const writable = new WriteAndCallNextWithError();

writable.on('error', err => console.error(err.message));
```

> Il est fortement conseillé au consommateur, de s'abonner aux événements `"error"` émis par vos Streams, afin de pouvoir y réagir de manière appropriée.

Voyons maintenant comment connecter les Streams entre eux.

### La méthode `pipe()`

La manière classique de connecter des Streams consiste à utiliser la méthode `pipe()` du Stream Readable.

```ts
const readable = new ReadableCounter();
const writable = new WritableLogger();

readable.pipe(writable);
```

Mais de cette manière, le consommateur est obligé de gérer les erreurs de chaque Stream séparément, en s'abonnant aux événements `"error"` pour chacun d'entre eux.

```ts
readable.on('error', (err: Error) => console.error(err.message));
writable.on('error', (err: Error) => console.error(err.message));
```

Notez que le code suivant, ne produira pas l'effet escompté, car seules les erreurs du Stream "Writable" seront prises en charge :

```ts
readable.pipe(writable).on('error', (err: Error) => console.error(err.message));
```

### La fonction `pipeline()`

La manière moderne de connecter des Streams consiste à utiliser la fonction `pipeline()`, qui permet de mutualiser les erreurs des Streams, pour les gérer en un seul endroit.

```ts
import { pipeline } from 'stream';

const readable = new ReadableCounter();
const writable = new WritableLogger();

pipeline(readable, writable, (err: Error) => {
  if (err) {
    console.error(err.message);
  }
});
```

## Cas d'usage : optimisation d'un serveur HTTP

Pour conclure cet article, vous allez implémenter en quelques lignes de code, un serveur HTTP capable de servir un fichier local de très grande taille, sans pour autant surcharger la mémoire vive allouée au processus du serveur.

Pour cela, vous allez utiliser la fonction `createReadStream()` du module `'fs'`, qui permet de créer un Stream "Readable" à partir d'un fichier local.

```ts
import { createReadStream } from 'fs';
import { createServer, IncomingMessage, ServerResponse } from 'http';

const server = createServer((req: IncomingMessage, res: ServerResponse) => {
  if (req.url === '/') {
    createReadStream('path/to/big/file').pipe(res);
  } else {
    res.end();
  }
});

server.listen(8080);
```

Il vous suffit donc d'utiliser la méthode `pipe()` pour connecter la lecture du fichier local à la réponse du serveur, qui vous l'avez compris, est un Stream "Writable" !

Je vous laisse imaginer la différence de performances avec l'implémentation suivante, où le fichier est intégralement chargé en mémoire avant d'être envoyé en réponse !

```ts
import { readFile } from 'fs';
import { createServer, IncomingMessage, ServerResponse } from 'http';

const server = createServer((req: IncomingMessage, res: ServerResponse) => {
  if (req.url === '/') {
    readFile('path/to/big/file', (err, data) => res.end(data));
  } else {
    res.end();
  }
});

server.listen(8080);
```

## Take away

Vous savez maintenant comment fonctionnent les Streams de Node.js de l'intérieur, et vous avez compris qu'ils sont vraiment partout !

Ensemble, nous avons vu qu'ils utilisent intensivement les modules `Buffer` et `EventEmitter`.
Nous avons exploré les Streams "Readable" et leurs subtils modes de fonctionnement "paused" et "flowing", ainsi que les Streams "Writable", plus simple à comprendre.
Nous avons abordé la gestion des erreurs et exploré les différentes manières de connecter les Streams entre eux avec la méthode `pipe()` et la fonction `pipeline()`.

J'espère que désormais, vous serez à l'aise pour implémenter ou tout simplement consommer des Streams.

Alors, je vous souhaite un _happy streaming ^^_

## Pour aller plus loin

Voici quelques pistes de sujets que vous pourriez explorer pour approfondir encore plus vos connaissances des Streams de Node.js.

- [En savoir plus sur les `Buffer`](https://nodejs.org/api/buffer.html)
- [En savoir plus sur les `EventEmitter`](https://nodejs.org/api/events.html)
- [Les Streams configurés en `ObjectMode` peuvent manipuler presque tous types de données JavaScript](https://nodejs.org/api/stream.html#stream_object_mode)
- [Découvrir les Streams `Duplex` et `Transform`, qui sont à la fois "Readable" et "Writable"](https://nodejs.org/api/stream.html#stream_duplex_and_transform_streams)
- [Consommer les chunks des Streams "Writable" en parallèle en implémentant la méthode `_writev()`](https://nodejs.org/api/stream.html#stream_writable_writev_chunks_callback)
