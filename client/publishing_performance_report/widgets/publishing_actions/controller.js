import {DATE_FILTERS} from '../../../search/directives/DateFilters';
import {CHART_FIELDS} from '../../../charts/directives/ChartOptions';
import {SDChart} from '../../../charts/SDChart';
import {CHART_COLOURS} from '../../../charts/directives/ChartColourPicker';
import {getErrorMessage} from '../../../utils';


PublishingActionsWidgetController.$inject = [
    '$scope',
    'lodash',
    'notify',
    'gettext',
    'searchReport',
    'chartConfig',
    'desks',
    '$interval',
];

export function PublishingActionsWidgetController(
    $scope,
    _,
    notify,
    gettext,
    searchReport,
    chartConfig,
    desks,
    $interval
) {
    this.init = (forSettings) => {
        $scope.ready = false;

        // This fixes an issue when a controller is created, deleted and created again quickly
        // Reduces the chance of multiple api queries happening
        $scope.$applyAsync(() => this._init(forSettings));
    };

    this._init = (forSettings) => {
        desks.initialize()
            .then(() => {
                $scope.currentDesk = desks.getCurrentDesk();

                if (!_.get($scope, 'widget.configuration')) {
                    $scope.widget.configuration = this.getDefaultConfig();
                }

                if (forSettings) {
                    this.initForSettings();
                } else {
                    this.initForWidget();
                }

                $scope.ready = true;
            });
    };

    this.initForSettings = () => {
        $scope.chartFields = [
            CHART_FIELDS.TITLE,
            CHART_FIELDS.SORT,
        ];

        $scope.dateFilters = [
            DATE_FILTERS.TODAY,
            DATE_FILTERS.THIS_WEEK,
            DATE_FILTERS.THIS_MONTH,
            DATE_FILTERS.RANGE,
            DATE_FILTERS.RELATIVE_DAYS,
            DATE_FILTERS.RELATIVE,
        ];
    };

    this.initForWidget = () => {
        $scope.chartConfig = null;
        this.interval = null;

        this.runQuery = (params) => searchReport.query(
            'publishing_performance_report',
            params,
            true
        );

        this.genConfig = (params, report) => {
            chartConfig.loadTranslations(['state'])
                .then(() => {
                    const numCategories = Object.values(report.subgroups)
                        .filter((value) => value > 0)
                        .length;
                    const numLegendRows = Math.ceil(numCategories / 2);
                    let legendOffset;
                    let center;

                    switch (numLegendRows) {
                    case 1:
                        legendOffset = [0, -10];
                        center = ['50%', '100%'];
                        break;
                    case 2:
                        legendOffset = [0, 0];
                        center = ['50%', '100%'];
                        break;
                    case 3:
                        legendOffset = [0, 10];
                        center = ['50%', '110%'];
                        break;
                    }

                    const chart = new SDChart.Chart({
                        id: $scope.widget._id + '-' + $scope.widget.multiple_id,
                        fullHeight: true,
                        exporting: false,
                        defaultConfig: chartConfig.defaultConfig,
                        legendFormat: '{y} {name}',
                        legendOffset: legendOffset,
                        shadow: false,
                        translations: chartConfig.translations,
                    });
                    const field = _.get(params, 'aggs.subgroup.field');

                    chart.addAxis()
                        .setOptions({
                            type: 'linear',
                            defaultChartType: 'pie',
                            categoryField: field,
                            categories: Object.keys(report.subgroups),
                            sortOrder: _.get(params, 'chart.sort_order') || 'asc',
                            excludeEmpty: true,
                        })
                        .addSeries()
                        .setOptions({
                            field: field,
                            data: report.subgroups,
                            colours: _.get(params, 'chart.colours'),
                            size: 260,
                            semiCircle: true,
                            center: center,
                            showInLegend: true,
                        });

                    $scope.chartConfig = chart.genConfig();
                    $scope.title = $scope.widget.configuration.chart.title || _.get($scope, 'widget.label');
                });
        };

        $scope.$watch(
            'widget.configuration',
            () => $scope.generateChart(),
            true
        );

        $scope.generateChart = () => {
            const params = Object.assign(
                {},
                _.get($scope, 'widget.configuration') || {},
                {
                    must: {desks: [$scope.currentDesk._id]},
                    must_not: {},
                    aggs: {
                        group: {field: 'task.desk'},
                        subgroup: {field: 'state'},
                    },
                }
            );

            return this.runQuery(params)
                .then(
                    (report) => this.genConfig(params, report),
                    (error) => {
                        notify.error(
                            getErrorMessage(error, gettext('Error. The report could not be generated.'))
                        );
                    }
                );
        };

        this.interval = $interval($scope.generateChart, 60000);
        $scope.$on('$destroy', () => {
            $interval.cancel(this.interval);
            this.interval = null;
        });
    };

    this.getDefaultConfig = () => ({
        dates: {filter: DATE_FILTERS.TODAY},
        chart: {
            sort_order: 'desc',
            title: _.get($scope, 'widget.label', gettext('Publishing Performance')),
            colours: {
                published: CHART_COLOURS.GREEN,
                killed: CHART_COLOURS.RED,
                corrected: CHART_COLOURS.BLUE,
                updated: CHART_COLOURS.YELLOW,
                recalled: CHART_COLOURS.BLACK,
            },
        },
    });
}
