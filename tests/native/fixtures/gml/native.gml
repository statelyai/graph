# Authored native fixture; integer identity and HTML numeric entities.
graph [
  directed 1
  multigraph 1
  label "Native &#945;"
  node [ id 0 label "A &amp; &quot;quoted&quot;" vendor "KEEP" ]
  node [ id 1 label "" ]
  node [ id 2 ]
  edge [ source 0 target 1 key 0 weight 2.5 label "first" ]
  edge [ source 0 target 1 key 1 weight -3 ]
]
