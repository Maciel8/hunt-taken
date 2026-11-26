// Conversa de cada missão com o NPC que a dá: apresentação, conversa durante e entrega.
// Aceitar e entregar continuam passando pelo servidor (quest_action); aqui é só a cena.
export const TALK = {
  q1_ratos: {
    start: ["Ei, você aí! Tem cara de quem sabe segurar uma espada.", "Os ratos tomaram os Celeiros de Arken, logo ao sul da vila. Comeram metade do trigo do inverno.", "Derrube 30 deles e a Fazendeira vai dormir em paz. A vila paga bem."],
    yes: "Deixa comigo. Vou limpar os celeiros.", no: "Agora não, guarda.",
    mid: ["Ainda ouço os ratos roendo daqui. Volte aos Celeiros de Arken e termine o serviço."],
    end: ["Trinta ratos? Ha! A Fazendeira vai fazer pão pra você o mês inteiro.", "Aqui está o pagamento. O Ferreiro anda procurando gente de confiança. Fale com ele quando estiver mais forte."],
  },
  q2_javalis: {
    start: ["Aço bom precisa de couro bom. E escudo bom precisa de presa de javali.", "Na Orla dos Carvalhos, descendo ao sul da vila, os javalis estão gordos e bravos este ano.", "Traga 40 abates e eu te pago como se fosse da guilda."],
    yes: "Vou caçar os javalis.", no: "Volto outra hora.",
    mid: ["Nada de presas ainda? A Orla dos Carvalhos fica descendo ao sul da vila. Cuidado com as presas."],
    end: ["Isso sim é presa de qualidade. Vou forjar uns escudos que aguentam até coice de troll.", "Tome. E fique de olho na estrada: o Guarda disse que caravanas estão sumindo."],
  },
  q3_bandidos: {
    start: ["Três caravanas sumiram na estrada sul esta semana.", "Os batedores acharam uma torre velha tomada por bandidos. A Torre dos Bandidos, bem ao sul, depois da Orla dos Carvalhos.", "Derrube 50 deles. Sem a torre, a estrada volta a ser nossa."],
    yes: "A torre vai cair.", no: "Ainda não estou pronto.",
    mid: ["A torre ainda está de pé. Os bandidos não vão sair de lá sozinhos."],
    end: ["A estrada está livre. Os mercadores já estão voltando a passar.", "Você ganhou o respeito da guarda. Tome sua recompensa e duas gemas do cofre da vila."],
  },
  q4_teias: {
    start: ["Seda da Ravina das Teias vale ouro no mercado de qualquer reino.", "O problema são as donas da seda. As aranhas da ravina, no começo da Floresta Sombria, não entregam nada de graça.", "Derrube 60 delas e eu fico com a seda. Você fica com o ouro."],
    yes: "Fechado. Vou à ravina.", no: "Aranha não é comigo.",
    mid: ["Ainda nada? A Ravina das Teias fica na entrada da Floresta Sombria. Leve poções, o veneno arde."],
    end: ["Que seda linda! Vou vender pros alfaiates de Frostheim.", "Seu pagamento. E um conselho: o Sacerdote anda preocupado com uivos na floresta."],
  },
  q5_uivos: {
    start: ["Os lobos da Clareira dos Uivos não dormem. Uivam a noite inteira, como se fugissem de algo.", "Diminua a matilha. 60 lobos. Enquanto isso, preste atenção no que os assusta."],
    yes: "Vou à clareira e descubro.", no: "Outra hora, padre.",
    mid: ["Os uivos continuam. A Clareira dos Uivos fica no meio da Floresta Sombria."],
    end: ["Então eles fugiam de uma maldição vinda do pântano. Eu temia isso.", "Que a luz de Arken te proteja. Tome sua recompensa. Quando estiver pronto, precisamos falar sobre a Bruxa."],
  },
  q6_bruxa: {
    start: ["A maldição vem da Cabana da Bruxa, no fundo do Pântano Vermelho.", "Ela não está sozinha. Há outras que seguem o mesmo caminho sombrio.", "Derrube 50 bruxas do pântano. Só assim a floresta respira de novo."],
    yes: "A maldição acaba comigo.", no: "Preciso me preparar antes.",
    mid: ["O pântano ainda está vermelho. A Cabana da Bruxa fica depois das Margens Negras. Não vá sem poções."],
    end: ["A maldição se desfez. Sinto o ar mais leve.", "Antes de cair, uma delas falou de algo que acordou embaixo das minas. Tome sua recompensa. O Ferreiro vai querer ouvir isso."],
  },
  q7_minas: {
    start: ["Embaixo das Minas Profundas, na fronteira de Ignareth, os mineiros mortos voltaram a cavar.", "Desça e derrube 60 deles. Quero saber o que eles estão procurando."],
    yes: "Vou descer nas minas.", no: "Minas me dão arrepios.",
    mid: ["Os mortos ainda cavam. A entrada das Minas Profundas fica no leste do mapa, a sudeste do pântano."],
    end: ["Eles cavavam em direção à montanha. Não era nas minas que a coisa dormia.", "Tome sua recompensa. O Sacerdote sabe o resto da história."],
  },
  q8_dragao: {
    start: ["Era na montanha. Ignaroth, o Dragão, acordou na caverna a leste da Caverna Congelada.", "As salas da caverna guardam a chave de obsidiana. Sem ela, você não chega ao covil.", "Termine isso. Arken inteira conta com você."],
    yes: "Ignaroth cai hoje.", no: "Ainda não estou à altura.",
    mid: ["Ignaroth ainda respira. A Caverna do Dragão fica nas Montanhas Gélidas, a leste da Caverna Congelada."],
    end: ["Você venceu Ignaroth. Seu nome vai ser cantado nas tavernas de todos os reinos.", "Tome sua recompensa. Mas a Fragmentação mal começou. Outros reinos vão precisar de você."],
  },
};
export const THANKS = { aceitar: "Conto com você. Volte quando terminar.", desistir: "Tudo bem. Se mudar de ideia, estou aqui." };
