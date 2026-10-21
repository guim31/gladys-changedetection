# changedetection.io

[changedetection.io](https://changedetection.io/) est un service libre et
auto-hébergé qui surveille des pages web et prévient quand elles changent :
une baisse de prix, un produit de retour en stock, un nouveau message sur un
forum, une nouvelle version d'un logiciel. Cette intégration amène ses
surveillances dans Gladys : chacune devient un appareil (changement non vu,
erreur, dernier changement, ce qui a changé, et prix et stock pour les pages de
boutique), des scènes peuvent réagir quand **n'importe quelle** page change,
qu'un prix baisse ou qu'un produit revient en stock, et un widget de tableau de
bord liste les derniers changements.

Testée contre un vrai changedetection.io 0.60.9 (Docker) ; pas encore sur
toutes les installations : vos retours sont les bienvenus dans
[les issues](https://github.com/guim31/gladys-changedetection/issues).

## Ce qu'il vous faut

- Gladys Assistant 5.1.0 ou plus récent.
- changedetection.io, joignable depuis la machine de Gladys (sur le réseau
  local, ou sur Internet en HTTPS), avec son API activée (c'est le réglage par
  défaut).
- Sa clé d'API.

C'est changedetection.io qui surveille, au rythme réglé pour chaque
surveillance (toutes les 3 heures par défaut) : Gladys lit ses résultats, sans
jamais aller chercher les pages lui-même. Les surveillances se créent et se
modifient dans changedetection.io.

## Mise en route

### 1. Copier la clé d'API

Dans changedetection.io, ouvrez **Settings → API**. Vérifiez que **API
access** est activé et copiez l'**API key**.

### 2. Configurer l'intégration

Dans Gladys, ouvrez l'intégration, puis son onglet **Configuration** :

- **Adresse de changedetection.io** : l'adresse avec laquelle vous ouvrez
  changedetection.io, port compris, par exemple `http://192.168.1.2:5000`. Une
  adresse copiée depuis le navigateur convient aussi.
- **Clé d'API** : la clé copiée plus haut.
- **Intervalle de rafraîchissement** : la fréquence à laquelle Gladys lit les
  résultats (1 minute par défaut). Une requête par lecture, plus quelques-unes
  après un changement.
- **Devise des prix** : l'unité du prix des surveillances « Re-stock & Price
  detection » (euro par défaut). changedetection.io donne le prix sans sa
  devise.
- **Accepter les certificats auto-signés** : seulement pour une adresse en
  `https://` dont le certificat n'est pas reconnu par votre navigateur non
  plus.
- **Langue des noms** : la langue des noms des fonctionnalités, des dates et
  des messages d'erreur (français par défaut).

Enregistrez, puis cliquez sur **Tester la connexion** : la version de
changedetection.io s'affiche, avec le nombre de surveillances, celles en erreur
et les changements non vus.

### 3. Ajouter les surveillances

L'onglet **Découverte** liste un appareil **changedetection.io** et un appareil
par surveillance. Ajoutez celles que vous voulez voir dans Gladys. Les
déclencheurs de scène valent pour toutes les surveillances, ajoutées ou non.

## Les appareils

Chaque surveillance a :

- **Changement non vu** : allumé tant qu'un changement n'a pas été vu (dans
  changedetection.io, ou par l'action « Marquer comme vu »).
- **En erreur** : allumé tant que la dernière vérification de la page a
  échoué.
- **Message d'erreur** : la raison du dernier échec, « Aucune » sinon.
- **Dernier changement** : la date et l'heure du dernier changement.
- **Ce qui a changé** : un court extrait du dernier changement vu par
  l'intégration, les lignes ajoutées (ou les lignes retirées, précédées de
  « − »).
- Sur une surveillance de type « Re-stock & Price detection » seulement :
  **Prix** et **En stock**.

L'appareil **changedetection.io** compte les **Surveillances**, les
**Surveillances en erreur** et les **Changements non vus**.

## Tableau de bord

Le widget **Derniers changements** affiche le nombre de changements non vus et
de surveillances en erreur, puis les huit derniers changements, du plus récent
au plus ancien : titre, ce qui a changé, date, et un badge « Nouveau » ou
« Erreur ». Un appui sur un changement ouvre son détail, avec un lien vers la
page. Deux boutons :

- **Vérifier** : changedetection.io vérifie tout de suite toutes les pages.
- **Marquer vu** : plus aucun changement ne compte comme nouveau (une
  confirmation est demandée).

Dans ses réglages, **Surveillances** le limite aux appareils choisis (seuls les
appareils ajoutés à Gladys se choisissent).

## Scènes

### Déclencheurs

Ils valent pour toutes les surveillances, ajoutées à Gladys ou non. Laissez
**Surveillances** vide pour réagir à n'importe laquelle, ou choisissez-en.

- **Une page a changé** : changedetection.io a détecté un changement.
  Variables : titre de la surveillance, adresse de la page, ce qui a changé
  (une ligne, 200 caractères au plus), étiquettes.
- **Un prix a baissé** : le prix d'une surveillance « Re-stock & Price
  detection » a baissé. Variables : titre, adresse, prix, prix précédent,
  étiquettes.
- **De retour en stock** : une surveillance « Re-stock & Price detection » est
  passée d'épuisé à en stock. Variables : titre, adresse, prix, étiquettes.
- **Une surveillance échoue** : la vérification d'une page s'est mise à
  échouer (page disparue, erreur du serveur, filtre introuvable…). Une fois,
  jusqu'à ce qu'elle refonctionne. Variables : titre, adresse, message
  d'erreur, étiquettes.

Un changement survenu pendant un redémarrage de Gladys ou de l'intégration est
tout de même annoncé, une fois. Rien n'est annoncé à la toute première
lecture.

Pour réagir sous un seuil de prix, utilisez la fonctionnalité **Prix** de
l'appareil dans une scène de Gladys (« le prix passe sous 100 ») : les
déclencheurs de scène des intégrations ne comparent que l'égalité.

### Actions

- **Vérifier une page maintenant** : changedetection.io vérifie tout de suite
  la page choisie (toutes les pages si le champ est vide, ou si l'appareil
  changedetection.io est choisi). Le résultat est lu 20 secondes plus tard et
  lance les déclencheurs ci-dessus. Résultat : le nombre de pages mises en
  file.
- **Marquer comme vu** : le changement de la surveillance choisie ne compte
  plus comme nouveau (tous les changements non vus si vide). Résultat : le
  nombre de surveillances marquées.

### Idées de scènes

- **Alerte prix** : déclencheur « Un prix a baissé » sur le moulin à café →
  envoyer un message « 💶 … passe à … (au lieu de …) » avec « Titre de la
  surveillance », « Prix » et « Prix précédent ».
- **Retour en stock** : déclencheur « De retour en stock » → envoyer un
  message avec le titre et l'adresse, puis passer une lampe au vert.
- **Actualités de la mairie** : déclencheur « Une page a changé » sur la page
  de la mairie → envoyer « 📰 … : … » avec « Titre de la surveillance » et « Ce
  qui a changé », puis « Marquer comme vu ».
- **Avant de partir** : chaque samedi à 9 h → « Vérifier une page maintenant »
  sur les horaires du marché.

## Dépannage

- **« Clé d'API refusée »** : recopiez la clé depuis Settings → API ; une clé
  régénérée dans changedetection.io invalide l'ancienne.
- **« Une clé d'API est nécessaire »** : changedetection.io demande une clé et
  aucune n'est configurée.
- **« changedetection.io ne répond pas »** : vérifiez l'adresse et le port
  (5000 par défaut) depuis la machine de Gladys. `localhost` désigne le
  conteneur de l'intégration lui-même : utilisez l'adresse IP de la machine qui
  fait tourner changedetection.io.
- **« Certificat refusé »** : le certificat HTTPS est auto-signé ou expiré ;
  cochez « Accepter les certificats auto-signés », ou utilisez l'adresse en
  `http://` sur le réseau local.
- **« Aucune API changedetection.io à cette adresse »** : l'adresse mène à un
  autre service, ou à un changedetection.io trop ancien pour avoir son API
  REST : mettez-le à jour.
- **Pas de prix sur une page de boutique** : la surveillance doit être du type
  « Re-stock & Price detection » dans changedetection.io, et la page doit
  publier son prix (c'est le cas de la plupart des boutiques). Le prix et le
  stock apparaissent une fois le type choisi ; cliquez sur « Rechercher » dans
  l'onglet Découverte, puis sur « Mettre à jour » sur l'appareil.
- **« Ce qui a changé » est vide** : il se remplit au premier changement vu
  par l'intégration.

## Limites

- changedetection.io vérifie les pages à son propre rythme ; Gladys lit les
  résultats à l'intervalle de rafraîchissement, un événement arrive donc au
  plus avec ce retard.
- L'extrait montre les lignes ajoutées ou retirées, pas les changements à
  l'intérieur d'une ligne, et il est coupé à 200 caractères.
- changedetection.io ne donne pas la devise du prix : l'unité vient de la
  configuration, la même pour toutes les surveillances.
- Les surveillances en pause restent listées (l'API ne dit pas lesquelles le
  sont).
- Les surveillances se créent, se modifient et se suppriment dans
  changedetection.io ; Gladys sait seulement les vérifier tout de suite et les
  marquer comme vues.
