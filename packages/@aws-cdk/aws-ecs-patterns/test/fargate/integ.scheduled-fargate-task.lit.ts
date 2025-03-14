import ec2 = require('@aws-cdk/aws-ec2');
import ecs = require('@aws-cdk/aws-ecs');
import events = require('@aws-cdk/aws-events');
import cdk = require('@aws-cdk/core');
import path = require('path');

import { ScheduledFargateTask } from '../../lib';

const app = new cdk.App();

class EventStack extends cdk.Stack {
  constructor(scope: cdk.App, id: string) {
    super(scope, id);

    const vpc = new ec2.Vpc(this, 'Vpc', { maxAZs: 1 });
    const cluster = new ecs.Cluster(this, 'FargateCluster', { vpc });

    // Create the scheduled task
    new ScheduledFargateTask(this, 'ScheduledFargateTask', {
      cluster,
      image: new ecs.AssetImage(path.join(__dirname, '..', 'demo-image')),
      desiredTaskCount: 2,
      memoryLimitMiB: 512,
      cpu: 256,
      environment: { name: 'TRIGGER', value: 'CloudWatch Events' },
      schedule: events.Schedule.rate(cdk.Duration.minutes(2)),
    });
  }
}

new EventStack(app, 'aws-fargate-integ');
app.synth();
