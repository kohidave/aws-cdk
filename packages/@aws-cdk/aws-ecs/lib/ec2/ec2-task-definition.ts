import { Construct, Resource } from '@aws-cdk/core';
import { CommonTaskDefinitionProps, Compatibility, ITaskDefinition, NetworkMode, TaskDefinition } from '../base/task-definition';
import { PlacementConstraint } from '../placement';

/**
 * Properties to define an ECS task definition
 */
export interface Ec2TaskDefinitionProps extends CommonTaskDefinitionProps {
  /**
   * The networking mode to use for the containers in the task.
   *
   * On Fargate, the only supported networking mode is AwsVpc.
   *
   * @default - NetworkMode.Bridge for EC2 tasks, AwsVpc for Fargate tasks.
   */
  readonly networkMode?: NetworkMode;

  /**
   * An array of placement constraint objects to use for the task. You can
   * specify a maximum of 10 constraints per task (this limit includes
   * constraints in the task definition and those specified at run time).
   *
   * Not supported in Fargate.
   *
   * @default - No placement constraints.
   */
  readonly placementConstraints?: PlacementConstraint[];
}

export interface IEc2TaskDefinition extends ITaskDefinition {

}

/**
 * Define Tasks to run on an ECS cluster
 *
 * @resource AWS::ECS::TaskDefinition
 */
export class Ec2TaskDefinition extends TaskDefinition implements IEc2TaskDefinition {

  public static fromEc2TaskDefinitionArn(scope: Construct, id: string, ec2TaskDefinitionArn: string): IEc2TaskDefinition {
    class Import extends Resource implements IEc2TaskDefinition {
      public readonly taskDefinitionArn = ec2TaskDefinitionArn;
      public readonly compatibility = Compatibility.EC2;
      public readonly isEc2Compatible = true;
      public readonly isFargateCompatible = false;
    }
    return new Import(scope, id);
  }

  /**
   * Constructs a new instance of the Ec2TaskDefinition class.
   */
  constructor(scope: Construct, id: string, props: Ec2TaskDefinitionProps = {}) {
    super(scope, id, {
      ...props,
      compatibility: Compatibility.EC2,
      placementConstraints: props.placementConstraints,
    });
  }
}
