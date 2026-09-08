module.exports = {
  default: {
    paths: ['features/**/*.feature'],
    require: ['features/step_definitions/**/*.js', 'features/support/**/*.js'],
    format: ['progress'],
    publishQuiet: true,
    // Scénarios mycicd exportés en @wip : facultatifs jusqu'à activation manuelle
    tags: 'not @wip',
  },
  wip: {
    paths: ['features/**/*.feature'],
    require: ['features/step_definitions/**/*.js', 'features/support/**/*.js'],
    format: ['progress'],
    publishQuiet: true,
    tags: '@wip',
  },
};
