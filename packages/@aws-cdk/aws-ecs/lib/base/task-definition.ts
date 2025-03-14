import iam = require('@aws-cdk/aws-iam');
import { Construct, IResource, Lazy, Resource } from '@aws-cdk/core';
import { ContainerDefinition, ContainerDefinitionOptions } from '../container-definition';
import { CfnTaskDefinition } from '../ecs.generated';
import { PlacementConstraint } from '../placement';

export interface ITaskDefinition extends IResource {
  /**
   * ARN of this task definition
   * @attribute
   */
  readonly taskDefinitionArn: string;

  /**
   * Execution role for this task definition
   */
  readonly executionRole?: iam.IRole;

  /**
   * What launch types this task definition should be compatible with.
   */
  readonly compatibility: Compatibility;

  /**
   * Return true if the task definition can be run on an EC2 cluster
   */
  readonly isEc2Compatible: boolean;

  /**
   * Return true if the task definition can be run on a Fargate cluster
   */
  readonly isFargateCompatible: boolean;
}

/**
 * The common properties for all task definitions. For more information, see Task Definition Parameters:
 * [https://docs.aws.amazon.com/AmazonECS/latest/developerguide/task_definition_parameters.html]
 */
export interface CommonTaskDefinitionProps {
  /**
   * The name of a family that this task definition is registered to. A family groups multiple versions of a task definition.
   *
   * @default - Automatically generated name.
   */
  readonly family?: string;

  /**
   * The name of the IAM task execution role that grants the ECS agent to call AWS APIs on your behalf.
   *
   * The role will be used to retrieve container images from ECR and create CloudWatch log groups.
   *
   * @default - An execution role will be automatically created if you use ECR images in your task definition.
   */
  readonly executionRole?: iam.IRole;

  /**
   * The name of the IAM role that grants containers in the task permission to call AWS APIs on your behalf.
   *
   * @default - A task role is automatically created for you.
   */
  readonly taskRole?: iam.IRole;

  /**
   * The list of volume definitions for the task. For more information, see Task Definition Parameter Volumes:
   * [https://docs.aws.amazon.com/AmazonECS/latest/developerguide//task_definition_parameters.html#volumes]
   *
   * @default - No volumes are passed to the Docker daemon on a container instance.
   */
  readonly volumes?: Volume[];
}

/**
 * Properties for generic task definitions
 */
export interface TaskDefinitionProps extends CommonTaskDefinitionProps {
  /**
   * The Docker networking mode to use for the containers in the task.
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

  /**
   * What launch types this task definition should be compatible with.
   */
  readonly compatibility: Compatibility;

  /**
   * The number of cpu units used by the task.
   *
   * Optional for EC2 tasks and any value can be used.
   *
   * Required for Fargate tasks
   * Valid values, which determines your range of valid values for the memory parameter:
   * 256 (.25 vCPU) - Available memory values: 0.5GB, 1GB, 2GB
   * 512 (.5 vCPU) - Available memory values: 1GB, 2GB, 3GB, 4GB
   * 1024 (1 vCPU) - Available memory values: 2GB, 3GB, 4GB, 5GB, 6GB, 7GB, 8GB
   * 2048 (2 vCPU) - Available memory values: Between 4GB and 16GB in 1GB increments
   * 4096 (4 vCPU) - Available memory values: Between 8GB and 30GB in 1GB increments
   *
   * @default - CPU units are not specified.
   */
  readonly cpu?: string;

  /**
   * The amount (in MiB) of memory used by the task.
   *
   * Optional for EC2 tasks and any value can be used.
   *
   * Required for Fargate tasks
   * This field is required and you must use one of the following values, which determines your range of valid values
   * for the cpu parameter:
   *
   * 0.5GB, 1GB, 2GB - Available cpu values: 256 (.25 vCPU)
   *
   * 1GB, 2GB, 3GB, 4GB - Available cpu values: 512 (.5 vCPU)
   *
   * 2GB, 3GB, 4GB, 5GB, 6GB, 7GB, 8GB - Available cpu values: 1024 (1 vCPU)
   *
   * Between 4GB and 16GB in 1GB increments - Available cpu values: 2048 (2 vCPU)
   *
   * Between 8GB and 30GB in 1GB increments - Available cpu values: 4096 (4 vCPU)
   *
   * @default - Memory used by task is not specified.
   */
  readonly memoryMiB?: string;
}

abstract class TaskDefinitionBase extends Resource implements ITaskDefinition {

  public abstract readonly compatibility: Compatibility;
  public abstract readonly taskDefinitionArn: string;
  public abstract readonly executionRole?: iam.IRole;

  /**
   * Return true if the task definition can be run on an EC2 cluster
   */
  public get isEc2Compatible(): boolean {
    return isEc2Compatible(this.compatibility);
  }

  /**
   * Return true if the task definition can be run on a Fargate cluster
   */
  public get isFargateCompatible(): boolean {
    return isFargateCompatible(this.compatibility);
  }
}

/**
 * Base class for Ecs and Fargate task definitions
 */
export class TaskDefinition extends TaskDefinitionBase {

  /**
   * Imports a task definition by ARN.
   *
   * The task will have a compatibility of EC2+Fargate.
   */
  public static fromTaskDefinitionArn(scope: Construct, id: string, taskDefinitionArn: string): ITaskDefinition {
    class Import extends TaskDefinitionBase {
      public readonly taskDefinitionArn = taskDefinitionArn;
      public readonly compatibility = Compatibility.EC2_AND_FARGATE;
      public readonly executionRole?: iam.IRole = undefined;
    }

    return new Import(scope, id);
  }

  /**
   * The family name of this task definition
   */
  public readonly family: string;

  /**
   * ARN of this task definition
   * @attribute
   */
  public readonly taskDefinitionArn: string;

  /**
   * Task role used by this task definition
   */
  public readonly taskRole: iam.IRole;

  /**
   * Network mode used by this task definition
   */
  public readonly networkMode: NetworkMode;

  /**
   * Default container for this task
   *
   * Load balancers will send traffic to this container. The first
   * essential container that is added to this task will become the default
   * container.
   */
  public defaultContainer?: ContainerDefinition;

  /**
   * What launching modes this task is compatible with
   */
  public readonly compatibility: Compatibility;

  /**
   * All containers
   */
  protected readonly containers = new Array<ContainerDefinition>();

  /**
   * All volumes
   */
  private readonly volumes: Volume[] = [];

  /**
   * Placement constraints for task instances
   */
  private readonly placementConstraints = new Array<CfnTaskDefinition.TaskDefinitionPlacementConstraintProperty>();

  private _executionRole?: iam.IRole;

  /**
   * Constructs a new instance of the TaskDefinition class.
   */
  constructor(scope: Construct, id: string, props: TaskDefinitionProps) {
    super(scope, id);

    this.family = props.family || this.node.uniqueId;
    this.compatibility = props.compatibility;

    if (props.volumes) {
      props.volumes.forEach(v => this.addVolume(v));
    }

    this.networkMode = props.networkMode !== undefined ? props.networkMode :
                       this.isFargateCompatible ? NetworkMode.AWS_VPC : NetworkMode.BRIDGE;
    if (this.isFargateCompatible && this.networkMode !== NetworkMode.AWS_VPC) {
      throw new Error(`Fargate tasks can only have AwsVpc network mode, got: ${this.networkMode}`);
    }

    if (props.placementConstraints && props.placementConstraints.length > 0 && this.isFargateCompatible) {
      throw new Error('Cannot set placement constraints on tasks that run on Fargate');
    }

    if (this.isFargateCompatible && (!props.cpu || !props.memoryMiB)) {
      throw new Error(`Fargate-compatible tasks require both CPU (${props.cpu}) and memory (${props.memoryMiB}) specifications`);
    }

    this._executionRole = props.executionRole;

    this.taskRole = props.taskRole || new iam.Role(this, 'TaskRole', {
        assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
    });

    const taskDef = new CfnTaskDefinition(this, 'Resource', {
      containerDefinitions: Lazy.anyValue({ produce: () => this.containers.map(x => x.renderContainerDefinition()) }),
      volumes: Lazy.anyValue({ produce: () => this.volumes }),
      executionRoleArn: Lazy.stringValue({ produce: () => this.executionRole && this.executionRole.roleArn }),
      family: this.family,
      taskRoleArn: this.taskRole.roleArn,
      requiresCompatibilities: [
        ...(isEc2Compatible(props.compatibility) ? ["EC2"] : []),
        ...(isFargateCompatible(props.compatibility) ? ["FARGATE"] : []),
      ],
      networkMode: this.networkMode,
      placementConstraints: Lazy.anyValue({ produce: () =>
        !isFargateCompatible(this.compatibility) && this.placementConstraints.length > 0 ? this.placementConstraints : undefined
      }),
      cpu: props.cpu,
      memory: props.memoryMiB,
    });

    if (props.placementConstraints) {
      props.placementConstraints.forEach(pc => this.addPlacementConstraint(pc));
    }

    this.taskDefinitionArn = taskDef.ref;
  }

  public get executionRole(): iam.IRole | undefined {
    return this._executionRole;
  }

  /**
   * Add a policy statement to the Task Role
   */
  public addToTaskRolePolicy(statement: iam.PolicyStatement) {
    this.taskRole.addToPolicy(statement);
  }

  /**
   * Add a policy statement to the Execution Role
   */
  public addToExecutionRolePolicy(statement: iam.PolicyStatement) {
    this.obtainExecutionRole().addToPolicy(statement);
  }

  /**
   * Create a new container to this task definition
   */
  public addContainer(id: string, props: ContainerDefinitionOptions) {
    return new ContainerDefinition(this, id, { taskDefinition: this, ...props });
  }

  /**
   * Links a container to this task definition.
   * @internal
   */
  public _linkContainer(container: ContainerDefinition) {
    this.containers.push(container);
    if (this.defaultContainer === undefined && container.essential) {
      this.defaultContainer = container;
    }
  }

  /**
   * Add a volume to this task definition
   */
  public addVolume(volume: Volume) {
    this.volumes.push(volume);
  }

  /**
   * Constrain where tasks can be placed
   */
  public addPlacementConstraint(constraint: PlacementConstraint) {
    if (isFargateCompatible(this.compatibility)) {
      throw new Error('Cannot set placement constraints on tasks that run on Fargate');
    }
    this.placementConstraints.push(...constraint.toJson());
  }

  /**
   * Extend this TaskDefinition with the given extension
   *
   * Extension can be used to apply a packaged modification to
   * a task definition.
   */
  public addExtension(extension: ITaskDefinitionExtension) {
    extension.extend(this);
  }

  /**
   * Create the execution role if it doesn't exist
   */
  public obtainExecutionRole(): iam.IRole {
    if (!this._executionRole) {
      this._executionRole = new iam.Role(this, 'ExecutionRole', {
        assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      });
    }
    return this._executionRole;
  }

  /**
   * Validate this task definition
   */
  protected validate(): string[] {
    const ret = super.validate();

    if (isEc2Compatible(this.compatibility)) {
      // EC2 mode validations

      // Container sizes
      for (const container of this.containers) {
        if (!container.memoryLimitSpecified) {
          ret.push(`ECS Container ${container.node.id} must have at least one of 'memoryLimitMiB' or 'memoryReservationMiB' specified`);
        }
      }
    }
    return ret;
  }
}

/**
 * The networking mode to use for the containers in the task.
 */
export enum NetworkMode {
  /**
   * The task's containers do not have external connectivity and port mappings can't be specified in the container definition.
   */
  NONE = 'none',

  /**
   * The task utilizes Docker's built-in virtual network which runs inside each container instance.
   */
  BRIDGE = 'bridge',

  /**
   * The task is allocated an elastic network interface.
   */
  AWS_VPC = 'awsvpc',

  /**
   * The task bypasses Docker's built-in virtual network and maps container ports directly to the EC2 instance's network interface directly.
   *
   * In this mode, you can't run multiple instantiations of the same task on a
   * single container instance when port mappings are used.
   */
  HOST = 'host',
}

/**
 * Volume definition
 */
export interface Volume {
  /**
   * Path on the host
   */
  readonly host?: Host;

  /**
   * A name for the volume
   */
  readonly name: string;

  /**
   * Specifies this configuration when using Docker volumes
   */
  readonly dockerVolumeConfiguration?: DockerVolumeConfiguration;
}

/**
 * A volume host
 */
export interface Host {
  /**
   * Source path on the host
   */
  readonly sourcePath?: string;
}

/**
 * A configuration of a Docker volume
 */
export interface DockerVolumeConfiguration {
  /**
   * If true, the Docker volume is created if it does not already exist
   *
   * @default false
   */
  readonly autoprovision?: boolean;
  /**
   * The Docker volume driver to use
   */
  readonly driver: string;
  /**
   * A map of Docker driver specific options passed through
   *
   * @default No options
   */
  readonly driverOpts?: string[];
  /**
   * Custom metadata to add to your Docker volume
   *
   * @default No labels
   */
  readonly labels?: string[];
  /**
   * The scope for the Docker volume which determines it's lifecycle
   */
  readonly scope: Scope;
}

export enum Scope {
  /**
   * Docker volumes are automatically provisioned when the task starts and destroyed when the task stops
   */
  TASK = "task",

  /**
   * Docker volumes are persist after the task stops
   */
  SHARED = "shared"
}

/**
 * The task launch type compatibility requirement.
 */
export enum Compatibility {
  /**
   * The task should specify the EC2 launch type.
   */
  EC2,

  /**
   * The task should specify the Fargate launch type.
   */
  FARGATE,

  /**
   * The task can specify either the EC2 or Fargate launch types.
   */
  EC2_AND_FARGATE
}

/**
 * An extension for Task Definitions
 *
 * Classes that want to make changes to a TaskDefinition (such as
 * adding helper containers) can implement this interface, and can
 * then be "added" to a TaskDefinition like so:
 *
 *    taskDefinition.addExtension(new MyExtension("some_parameter"));
 */
export interface ITaskDefinitionExtension {
  /**
   * Apply the extension to the given TaskDefinition
   *
   * @param taskDefinition [disable-awslint:ref-via-interface]
   */
  extend(taskDefinition: TaskDefinition): void;
}

/**
 * Return true if the given task definition can be run on an EC2 cluster
 */
function isEc2Compatible(compatibility: Compatibility): boolean {
  return [Compatibility.EC2, Compatibility.EC2_AND_FARGATE].includes(compatibility);
}

/**
 * Return true if the given task definition can be run on a Fargate cluster
 */
function isFargateCompatible(compatibility: Compatibility): boolean {
  return [Compatibility.FARGATE, Compatibility.EC2_AND_FARGATE].includes(compatibility);
}
