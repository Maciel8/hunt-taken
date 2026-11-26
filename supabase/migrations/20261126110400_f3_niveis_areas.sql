-- fase 3: nível mínimo e rótulo das áreas de caça seguem o nível novo das criaturas
set search_path = public;
update hunts set level_min = 23 where id = 'neve';
update hunts set level_min = 30 where id = 'gelo';
update hunts set level_min = 82 where id = 'ruinas1';
update hunts set level_min = 87 where id = 'templo';
update hunts set level_min = 92 where id = 'ruinas2';
update hunts set level_min = 67 where id = 'mina2';
update hunts set level_min = 4 where id = 'goblins';
update hunts set level_min = 16 where id = 'ancestrais';
update hunts set level_min = 75 where id = 'mina3';
update hunts set level_min = 1 where id = 'ratos';
update hunts set level_min = 2 where id = 'javalis';
update hunts set level_min = 6 where id = 'bandidos';
update hunts set level_min = 9 where id = 'aranhas';
update hunts set level_min = 12 where id = 'lobos';
update hunts set level_min = 14 where id = 'afogados';
update hunts set level_min = 16 where id = 'bruxas';
update hunts set level_min = 59 where id = 'mina1';
