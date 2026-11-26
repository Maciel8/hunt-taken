-- pontos de pesca que estavam fora do mapa (coordenada negativa ou além da borda) ou longe de qualquer margem alcançável:
-- vão pra água mais perto com margem alcançável a pé (posições calculadas pela malha do mapa)
set search_path = public;
update resource_nodes set x = 3, y = 169 where id = 'pesca_16';
update resource_nodes set x = 1, y = 195 where id = 'pesca_18';
update resource_nodes set x = 1, y = 182 where id = 'pesca_17';
update resource_nodes set x = 62, y = 48 where id = 'pesca_6';
update resource_nodes set x = 241, y = 196 where id = 'pesca_31';
