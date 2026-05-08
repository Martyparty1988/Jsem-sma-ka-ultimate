(() => {
  'use strict';

  const extraResponses = [
    {
      category: 'Panelákovej Dalajláma',
      description: 'Sedíš v astrálu, ponožky na útěku, duše ladí rádio Blaník z jiný dimenze.'
    },
    {
      category: 'Junkovej orloj',
      description: 'Praha odbila půlnoc, tvoje zorničky odbily konec směny a realita si vzala sick day.'
    },
    {
      category: 'Funky popelník',
      description: 'Voníš jak klubový koberec po apokalypse, ale aura má groove a trochu benzínu.'
    },
    {
      category: 'Psychedelickej revizor',
      description: 'Kontroluješ lístek do reality, jenže jízdenka je rohlík a tramvaj je tvoje svědomí.'
    },
    {
      category: 'Králičí díra deluxe',
      description: 'Spadl jsi do myšlenky, která měla sklep, Wi‑Fi a jedno hodně divný světlo.'
    },
    {
      category: 'Mozek na leasing',
      description: 'Splátka vědomí je po splatnosti. Inkaso provedla noc a nechala ti účtenku pod očima.'
    },
    {
      category: 'Fantom benzínky',
      description: 'Stojíš mezi párkem v rohlíku a osvícením. Oboje je teplý, podezřelý a trochu smutný.'
    },
    {
      category: 'Šaman z nonstopu',
      description: 'Mluvíš s lednicí, lednice mlčí, ale oba víte, že pravda je někde u energetáků.'
    },
    {
      category: 'Disko patolog',
      description: 'Zkoumáš vlastní výraz jako důkazní materiál. Příčina: noc. Mechanismus: basy.'
    },
    {
      category: 'Garážovej mystik',
      description: 'Tvoje aura bliká jak zářivka v dílně. Něco mezi prorokem, vrakem a starým reprákem.'
    },
    {
      category: 'Svatá trojice chaosu',
      description: 'Klíče nejsou, mobil žije vlastním životem a důstojnost čeká před klubem na taxi.'
    },
    {
      category: 'Rohlíkovej nihilista',
      description: 'Díváš se do prázdna a prázdno se ptá, jestli máš ještě drobný na večerku.'
    },
    {
      category: 'Kotelní filozof',
      description: 'Pochopil jsi vesmír, jen to neumíš říct bez šesti odboček a jednoho podezřelýho smíchu.'
    },
    {
      category: 'Fialovej kanárek',
      description: 'Zpíváš v hlavě písničku, kterou nikdo nesložil. Bohužel je chytlavá a má trauma.'
    },
    {
      category: 'Krevní skupina bassline',
      description: 'Máš rytmus místo pulsu. Doktor by brečel, DJ by zatleskal.'
    },
    {
      category: 'Absurdní astronaut',
      description: 'Skafandr nemáš, ale stejně opouštíš atmosféru. Řídicí středisko je kebabárna.'
    },
    {
      category: 'Špinavej zen',
      description: 'Našel jsi vnitřní klid. Ležel pod stolem, kouřil mentolku a říkal ti brácho.'
    },
    {
      category: 'Kocour z matrixu',
      description: 'Jednou jsi zamrkal a realita se načetla z Temu. Levná, barevná, podezřele hlučná.'
    },
    {
      category: 'Vesmírnej popelář',
      description: 'Sbíráš trosky svojí osobnosti do igelitky. Tříděný odpad, tříděný vzpomínky.'
    },
    {
      category: 'Neonovej bezdomovec času',
      description: 'Nevíš, kolik je hodin, ale čas tě už dávno vystěhoval z vlastního obličeje.'
    },
    {
      category: 'Tripovej účetní',
      description: 'Počítáš škody na duši, peněžence a reputaci. Excel se sám zavřel ze studu.'
    },
    {
      category: 'Kazetovej démon',
      description: 'Přehráváš stejnou větu dokola, jen pokaždý s větším přesvědčením a menší logikou.'
    },
    {
      category: 'Kyselý metro',
      description: 'V hlavě jede linka C přímo do podvědomí. Přestup na realitu je mimo provoz.'
    },
    {
      category: 'Betonovej motýl',
      description: 'Chceš lítat, ale máš křídla z paneláku a emoce z automatu na kafe.'
    },
    {
      category: 'Měsíční skladník',
      description: 'V očích máš inventuru vesmíru. Chybí tři hvězdy, dvě hodiny a jeden rozum.'
    },
    {
      category: 'Funky márnice',
      description: 'Vypadáš mrtvě, ale s rytmem. Pokud padneš, padneš do taktu.'
    },
    {
      category: 'Čaroděj z večerky',
      description: 'Kupuješ vodu a tváříš se, že to byl plán. Prodavač ví. Vždycky ví.'
    },
    {
      category: 'Hologram po výplatě',
      description: 'Fyzicky jsi tady, finančně jsi vzpomínka a mentálně leták na techno.'
    },
    {
      category: 'Divnej princ periferie',
      description: 'Koruna z kapuce, trůn z obrubníku, království mezi benzínkou a špatným nápadem.'
    },
    {
      category: 'Klasickej čtvrtek z podsvětí',
      description: 'Klasickej čtvrtek: duše v kabátu, mozek na balkóně a realita dole kouří u vchodu.'
    },
    {
      category: 'Úterní error v hlavě',
      description: 'Ideální trojkombinace pro úterý: oči jak reklama na problém, hlas jak starý reprák a plán žádnej.'
    }
  ];

  function responseKey(item) {
    return `${item.category}::${item.description}`;
  }

  function appendExtraResponses() {
    const app = window.SmazkaApp;
    const library = app?.state?.responseLibrary;
    if (!Array.isArray(library)) return false;

    const existing = new Set(library.map(responseKey));
    extraResponses.forEach((item) => {
      if (!existing.has(responseKey(item))) {
        library.push(item);
        existing.add(responseKey(item));
      }
    });
    return true;
  }

  window.SmazkaExtraResponses = extraResponses;

  let attempts = 0;
  const timer = window.setInterval(() => {
    attempts += 1;
    if (appendExtraResponses() || attempts > 30) {
      window.clearInterval(timer);
    }
  }, 120);
})();
