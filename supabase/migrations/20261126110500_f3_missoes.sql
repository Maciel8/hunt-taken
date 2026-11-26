-- missões acompanham os níveis novos
update quest_defs set min_level = v.l from (values ('q1_ratos',1),('q2_javalis',3),('q3_bandidos',7),('q4_teias',10),('q5_uivos',13),('q6_bruxa',17),('q7_minas',60),('q8_dragao',60)) v(id, l) where quest_defs.id = v.id;
